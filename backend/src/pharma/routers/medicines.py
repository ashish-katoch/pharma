import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.audit import write_audit
from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.batch import Batch
from pharma.models.medicine import Medicine, MrpHistory
from pharma.models.user import User
from pharma.schemas.medicine import MedicineIn, MedicineOut, MedicineUpdateIn
from pharma.schemas.ops import MrpHistoryEntryOut, OkOut, PriceHistoryEntryOut
from pharma.security import get_current_shop, get_current_user, require_owner

router = APIRouter(prefix="/medicines", tags=["medicines"])


async def _stock_map(db: AsyncSession, shop_id: uuid.UUID, medicine_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not medicine_ids:
        return {}
    stmt = (
        select(Batch.medicine_id, func.coalesce(func.sum(Batch.qty), 0))
        .where(Batch.shop_id == shop_id, Batch.medicine_id.in_(medicine_ids))
        .group_by(Batch.medicine_id)
    )
    rows = (await db.execute(stmt)).all()
    return {mid: int(qty) for mid, qty in rows}


@router.get("", response_model=list[MedicineOut])
async def list_medicines(
    q: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Medicine).where(Medicine.shop_id == shop_id)
    if q:
        stmt = stmt.where(Medicine.name.ilike(f"%{q}%"))
    stmt = stmt.limit(limit)
    meds = (await db.execute(stmt)).scalars().all()
    stock = await _stock_map(db, shop_id, [m.id for m in meds])
    return [MedicineOut(**{**MedicineOut.model_validate(m).model_dump(), "stock_qty": stock.get(m.id, 0)}) for m in meds]


@router.get("/suggest", response_model=list[MedicineOut])
async def suggest_medicines(symptom: str = Query(min_length=1), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(Medicine).where(Medicine.shop_id == shop_id, Medicine.generic_name.ilike(f"%{symptom}%")).limit(20)
    meds = (await db.execute(stmt)).scalars().all()
    return [MedicineOut.model_validate(m) for m in meds]


@router.get("/match", response_model=list[MedicineOut])
async def match_medicines(q: str = Query(min_length=1), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(Medicine).where(Medicine.shop_id == shop_id, Medicine.name.ilike(f"%{q}%")).limit(20)
    meds = (await db.execute(stmt)).scalars().all()
    return [MedicineOut.model_validate(m) for m in meds]


@router.get("/{medicine_id}/price-history", response_model=list[PriceHistoryEntryOut])
async def price_history(medicine_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Batch.purchase_price, Batch.selling_price, Batch.created_at)
        .where(Batch.shop_id == shop_id, Batch.medicine_id == medicine_id)
        .order_by(Batch.created_at)
    )
    rows = (await db.execute(stmt)).all()
    return [{"purchase_price": float(pp), "selling_price": float(sp), "recorded_at": ca.isoformat()} for pp, sp, ca in rows]


@router.get("/{medicine_id}/mrp-history", response_model=list[MrpHistoryEntryOut])
async def mrp_history(medicine_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(MrpHistory)
        .where(MrpHistory.shop_id == shop_id, MrpHistory.medicine_id == medicine_id)
        .order_by(MrpHistory.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [{"old_mrp": float(r.old_mrp), "new_mrp": float(r.new_mrp), "changed_by": r.changed_by, "changed_at": r.created_at.isoformat()} for r in rows]


@router.get("/{medicine_id}", response_model=MedicineOut)
async def get_medicine(medicine_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    med = await db.get(Medicine, medicine_id)
    if not med or med.shop_id != shop_id:
        raise NotFoundError("Medicine not found")
    stock = await _stock_map(db, shop_id, [med.id])
    return MedicineOut(**{**MedicineOut.model_validate(med).model_dump(), "stock_qty": stock.get(med.id, 0)})


@router.post("", response_model=MedicineOut)
async def create_medicine(
    payload: MedicineIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    med = Medicine(shop_id=shop_id, **payload.model_dump())
    db.add(med)
    await db.flush()  # populate med.id (Python-side UUID default only applies at flush)
    await write_audit(db, shop_id, user.email, "create", "medicine", str(med.id), payload.model_dump())
    await db.commit()
    return MedicineOut.model_validate(med)


@router.put("/{medicine_id}", response_model=MedicineOut)
async def update_medicine(
    medicine_id: uuid.UUID,
    payload: MedicineUpdateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    med = await db.get(Medicine, medicine_id)
    if not med or med.shop_id != shop_id:
        raise NotFoundError("Medicine not found")
    updates = payload.model_dump(exclude_unset=True)
    if "mrp" in updates and float(updates["mrp"]) != float(med.mrp):
        db.add(MrpHistory(
            shop_id=shop_id,
            medicine_id=med.id,
            old_mrp=med.mrp,
            new_mrp=updates["mrp"],
            changed_by=user.email,
        ))
    for field, value in updates.items():
        setattr(med, field, value)
    await write_audit(db, shop_id, user.email, "update", "medicine", str(med.id), updates)
    await db.commit()
    stock = await _stock_map(db, shop_id, [med.id])
    return MedicineOut(**{**MedicineOut.model_validate(med).model_dump(), "stock_qty": stock.get(med.id, 0)})


@router.post("/bulk", response_model=list[MedicineOut])
async def bulk_import(
    payload: list[MedicineIn],
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    created = []
    for item in payload:
        med = Medicine(shop_id=shop_id, **item.model_dump())
        db.add(med)
        created.append(med)
    await write_audit(db, shop_id, user.email, "bulk_create", "medicine", "bulk", {"count": len(payload)})
    await db.commit()
    return [MedicineOut.model_validate(m) for m in created]


@router.delete("/{medicine_id}", response_model=OkOut)
async def delete_medicine(
    medicine_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    med = await db.get(Medicine, medicine_id)
    if not med or med.shop_id != shop_id:
        raise NotFoundError("Medicine not found")
    await db.delete(med)
    await write_audit(db, shop_id, user.email, "delete", "medicine", str(medicine_id))
    await db.commit()
    return {"ok": True}
