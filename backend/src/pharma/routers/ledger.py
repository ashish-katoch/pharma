import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.bill import Bill
from pharma.models.misc import Expense
from pharma.models.supplier import SupplierPayment
from pharma.schemas.ops import LedgerEntryOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/ledger", tags=["ledger"])


@router.get("", response_model=list[LedgerEntryOut])
async def general_ledger(limit: int = Query(default=500, le=1000), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    bills = (
        await db.execute(select(Bill).where(Bill.shop_id == shop_id, Bill.status == "active").order_by(Bill.created_at.desc()).limit(limit))
    ).scalars().all()
    expenses = (
        await db.execute(select(Expense).where(Expense.shop_id == shop_id).order_by(Expense.created_at.desc()).limit(limit))
    ).scalars().all()
    payments = (
        await db.execute(select(SupplierPayment).where(SupplierPayment.shop_id == shop_id).order_by(SupplierPayment.created_at.desc()).limit(limit))
    ).scalars().all()

    entries = (
        [{"type": "sale", "id": str(b.id), "amount": float(b.total), "created_at": b.created_at.isoformat()} for b in bills]
        + [{"type": "expense", "id": str(e.id), "amount": -float(e.amount), "created_at": e.created_at.isoformat()} for e in expenses]
        + [{"type": "supplier_payment", "id": str(p.id), "amount": -float(p.amount), "created_at": p.created_at.isoformat()} for p in payments]
    )
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries[:limit]
