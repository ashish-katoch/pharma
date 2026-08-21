import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.purchase import Purchase, SupplierReturn
from pharma.models.supplier import Supplier, SupplierPayment, SupplierPrice
from pharma.schemas.ops import OkOut
from pharma.schemas.supplier import SupplierIn, SupplierLedgerOut, SupplierOut, SupplierPaymentIn, SupplierPaymentOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


async def _outstanding_balance(db: AsyncSession, shop_id: uuid.UUID, supplier_id: uuid.UUID) -> float:
    """Every purchase is assumed payable until offset by a payment or a
    return (no separate cash/credit distinction is tracked on Purchase —
    matches how pharmacies actually run distributor accounts: goods in on
    account, settled later)."""
    purchases = (
        await db.execute(select(Purchase.total).where(Purchase.shop_id == shop_id, Purchase.supplier_id == supplier_id))
    ).scalars().all()
    payments = (
        await db.execute(
            select(SupplierPayment.amount).where(SupplierPayment.shop_id == shop_id, SupplierPayment.supplier_id == supplier_id)
        )
    ).scalars().all()
    returns = (
        await db.execute(
            select(SupplierReturn.total).where(SupplierReturn.shop_id == shop_id, SupplierReturn.supplier_id == supplier_id)
        )
    ).scalars().all()
    return round(sum(float(p) for p in purchases) - sum(float(p) for p in payments) - sum(float(r) for r in returns), 2)


@router.get("", response_model=list[SupplierOut])
async def list_suppliers(
    q: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Supplier).where(Supplier.shop_id == shop_id)
    if q:
        stmt = stmt.where(Supplier.name.ilike(f"%{q}%"))
    stmt = stmt.limit(limit)
    suppliers = (await db.execute(stmt)).scalars().all()
    return [
        SupplierOut(**{**SupplierOut.model_validate(s).model_dump(), "outstanding_balance": await _outstanding_balance(db, shop_id, s.id)})
        for s in suppliers
    ]


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or supplier.shop_id != shop_id:
        raise NotFoundError("Supplier not found")
    balance = await _outstanding_balance(db, shop_id, supplier_id)
    return SupplierOut(**{**SupplierOut.model_validate(supplier).model_dump(), "outstanding_balance": balance})


@router.post("", response_model=SupplierOut)
async def create_supplier(payload: SupplierIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    supplier = Supplier(shop_id=shop_id, **payload.model_dump())
    db.add(supplier)
    await db.commit()
    return supplier


@router.put("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: uuid.UUID, payload: SupplierIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or supplier.shop_id != shop_id:
        raise NotFoundError("Supplier not found")
    for field, value in payload.model_dump().items():
        setattr(supplier, field, value)
    await db.commit()
    return supplier


@router.delete("/{supplier_id}", response_model=OkOut)
async def delete_supplier(
    supplier_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or supplier.shop_id != shop_id:
        raise NotFoundError("Supplier not found")
    await db.delete(supplier)
    await db.commit()
    return {"ok": True}


@router.post("/{supplier_id}/payments", response_model=SupplierPaymentOut)
async def record_supplier_payment(
    supplier_id: uuid.UUID,
    payload: SupplierPaymentIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or supplier.shop_id != shop_id:
        raise NotFoundError("Supplier not found")
    payment = SupplierPayment(shop_id=shop_id, supplier_id=supplier_id, **payload.model_dump())
    db.add(payment)
    await db.commit()
    return payment


@router.get("/{supplier_id}/payments", response_model=SupplierLedgerOut)
async def get_supplier_ledger(
    supplier_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    """Despite the URL, this returns the full ledger (purchases, payments,
    and returns) not just payments — kept at this path since it's the
    existing route staff already record payments against."""
    supplier = await db.get(Supplier, supplier_id)
    if not supplier or supplier.shop_id != shop_id:
        raise NotFoundError("Supplier not found")

    purchases = (
        await db.execute(select(Purchase).where(Purchase.shop_id == shop_id, Purchase.supplier_id == supplier_id))
    ).scalars().all()
    payments = (
        await db.execute(
            select(SupplierPayment).where(SupplierPayment.shop_id == shop_id, SupplierPayment.supplier_id == supplier_id)
        )
    ).scalars().all()
    returns = (
        await db.execute(
            select(SupplierReturn).where(SupplierReturn.shop_id == shop_id, SupplierReturn.supplier_id == supplier_id)
        )
    ).scalars().all()

    raw_entries = (
        [("purchase", p.id, float(p.total), p.invoice_no, p.created_at) for p in purchases]
        + [("payment", p.id, -float(p.amount), p.notes, p.created_at) for p in payments]
        + [("return", r.id, -float(r.total), r.debit_note_no, r.created_at) for r in returns]
    )
    raw_entries.sort(key=lambda e: e[4])

    running_balance = 0.0
    entries = []
    for entry_type, ref_id, delta, notes, created_at in raw_entries:
        running_balance += delta
        entries.append(
            {
                "type": entry_type,
                "ref_id": ref_id,
                "amount": abs(delta),
                "notes": notes,
                "created_at": created_at,
                "balance_after": round(running_balance, 2),
            }
        )

    return {
        "supplier": SupplierOut(
            **{**SupplierOut.model_validate(supplier).model_dump(), "outstanding_balance": round(running_balance, 2)}
        ),
        "entries": entries,
    }


@router.get("/{supplier_id}/prices")
async def get_supplier_prices(
    supplier_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SupplierPrice).where(
        SupplierPrice.shop_id == shop_id,
        SupplierPrice.supplier_id == supplier_id,
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [{"medicine_id": str(r.medicine_id), "purchase_price": float(r.purchase_price)} for r in rows]
