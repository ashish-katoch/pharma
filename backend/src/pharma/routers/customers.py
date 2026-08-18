import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.customer import CreditLedgerEntry, Customer
from pharma.schemas.customer import (
    CreditLedgerIn,
    CreditLedgerOut,
    CustomerIn,
    CustomerLedgerOut,
    CustomerOut,
    CustomerUpdateIn,
)
from pharma.schemas.ops import LoyaltyOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/customers", tags=["customers"])


def _balance_delta():
    """credit entries increase what the customer owes; payments reduce it."""
    return func.sum(case((CreditLedgerEntry.entry_type == "credit", CreditLedgerEntry.amount), else_=-CreditLedgerEntry.amount))


async def _balances_for(db: AsyncSession, shop_id: uuid.UUID, customer_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    if not customer_ids:
        return {}
    stmt = (
        select(CreditLedgerEntry.customer_id, _balance_delta())
        .where(CreditLedgerEntry.shop_id == shop_id, CreditLedgerEntry.customer_id.in_(customer_ids))
        .group_by(CreditLedgerEntry.customer_id)
    )
    rows = (await db.execute(stmt)).all()
    return {cid: float(bal) for cid, bal in rows}


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    q: str | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer).where(Customer.shop_id == shop_id)
    if q:
        stmt = stmt.where(Customer.name.ilike(f"%{q}%"))
    stmt = stmt.limit(limit)
    customers = (await db.execute(stmt)).scalars().all()
    balances = await _balances_for(db, shop_id, [c.id for c in customers])
    return [
        CustomerOut(**{**CustomerOut.model_validate(c).model_dump(), "outstanding_balance": balances.get(c.id, 0.0)})
        for c in customers
    ]


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    customer = await db.get(Customer, customer_id)
    if not customer or customer.shop_id != shop_id:
        raise NotFoundError("Customer not found")
    balances = await _balances_for(db, shop_id, [customer.id])
    return CustomerOut(**{**CustomerOut.model_validate(customer).model_dump(), "outstanding_balance": balances.get(customer.id, 0.0)})


@router.post("", response_model=CustomerOut)
async def create_customer(payload: CustomerIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    customer = Customer(shop_id=shop_id, **payload.model_dump())
    db.add(customer)
    await db.commit()
    return customer


@router.put("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    customer = await db.get(Customer, customer_id)
    if not customer or customer.shop_id != shop_id:
        raise NotFoundError("Customer not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    await db.commit()
    return customer


@router.get("/{customer_id}/loyalty", response_model=LoyaltyOut)
async def get_loyalty(customer_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    customer = await db.get(Customer, customer_id)
    if not customer or customer.shop_id != shop_id:
        raise NotFoundError("Customer not found")
    return {"loyalty_points": customer.loyalty_points}


@router.get("/{customer_id}/ledger", response_model=CustomerLedgerOut)
async def get_customer_ledger(
    customer_id: uuid.UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    customer = await db.get(Customer, customer_id)
    if not customer or customer.shop_id != shop_id:
        raise NotFoundError("Customer not found")

    stmt = select(CreditLedgerEntry).where(
        CreditLedgerEntry.shop_id == shop_id, CreditLedgerEntry.customer_id == customer_id
    )
    if date_from:
        stmt = stmt.where(CreditLedgerEntry.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(CreditLedgerEntry.created_at <= datetime.combine(date_to, datetime.max.time()))
    stmt = stmt.order_by(CreditLedgerEntry.created_at)
    rows = (await db.execute(stmt)).scalars().all()

    # balance_after within a filtered window starts from the balance carried
    # in from entries before date_from, not from zero, so it stays accurate
    # even when the caller only asked for a slice of history.
    running_balance = 0.0
    if date_from:
        prior_stmt = select(_balance_delta()).where(
            CreditLedgerEntry.shop_id == shop_id,
            CreditLedgerEntry.customer_id == customer_id,
            CreditLedgerEntry.created_at < datetime.combine(date_from, datetime.min.time()),
        )
        prior = (await db.execute(prior_stmt)).scalar_one()
        running_balance = float(prior) if prior is not None else 0.0

    entries = []
    for row in rows:
        running_balance += float(row.amount) if row.entry_type == "credit" else -float(row.amount)
        entries.append(
            {
                "id": row.id,
                "entry_type": row.entry_type,
                "amount": float(row.amount),
                "notes": row.notes,
                "bill_id": row.bill_id,
                "created_at": row.created_at,
                "balance_after": round(running_balance, 2),
            }
        )

    true_balance = (await _balances_for(db, shop_id, [customer_id])).get(customer_id, 0.0)
    return {
        "customer": CustomerOut(
            **{**CustomerOut.model_validate(customer).model_dump(), "outstanding_balance": round(true_balance, 2)}
        ),
        "entries": entries,
    }


@router.post("/{customer_id}/ledger", response_model=CreditLedgerOut)
async def add_ledger_entry(
    customer_id: uuid.UUID,
    payload: CreditLedgerIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    customer = await db.get(Customer, customer_id)
    if not customer or customer.shop_id != shop_id:
        raise NotFoundError("Customer not found")
    entry = CreditLedgerEntry(shop_id=shop_id, customer_id=customer_id, **payload.model_dump())
    db.add(entry)
    await db.commit()
    return entry
