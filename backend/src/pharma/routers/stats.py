import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.bill import Bill, BillLine
from pharma.models.customer import CreditLedgerEntry
from pharma.models.medicine import Medicine
from pharma.models.misc import Expense
from pharma.models.purchase import Purchase
from pharma.models.user import User
from pharma.schemas.ops import StaffSalesOut, TodayStatsOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/stats", tags=["stats"])


async def _sales_and_count(db: AsyncSession, shop_id: uuid.UUID, start: datetime, end: datetime) -> tuple[float, int]:
    stmt = select(func.coalesce(func.sum(Bill.total), 0), func.count(Bill.id)).where(
        Bill.shop_id == shop_id, Bill.status == "active", Bill.created_at >= start, Bill.created_at < end
    )
    total, count = (await db.execute(stmt)).one()
    return float(total), int(count)


@router.get("/today", response_model=TodayStatsOut)
async def stats_today(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    total_sales, bill_count = await _sales_and_count(db, shop_id, start, end)

    revenue_stmt = select(func.coalesce(func.sum(Bill.subtotal), 0)).where(
        Bill.shop_id == shop_id, Bill.status == "active", Bill.created_at >= start, Bill.created_at < end
    )
    revenue = float((await db.execute(revenue_stmt)).scalar_one())

    cogs_stmt = (
        select(func.coalesce(func.sum(BillLine.qty * Batch.purchase_price), 0))
        .join(Bill, Bill.id == BillLine.bill_id)
        .join(Batch, Batch.id == BillLine.batch_id)
        .where(Bill.shop_id == shop_id, Bill.status == "active", Bill.created_at >= start, Bill.created_at < end)
    )
    cogs = float((await db.execute(cogs_stmt)).scalar_one())

    expense_stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.shop_id == shop_id, Expense.expense_date == today
    )
    expenses_today = float((await db.execute(expense_stmt)).scalar_one())

    purchase_stmt = select(func.coalesce(func.sum(Purchase.total), 0)).where(
        Purchase.shop_id == shop_id, Purchase.created_at >= start, Purchase.created_at < end
    )
    purchase_total = float((await db.execute(purchase_stmt)).scalar_one())

    balance_delta = func.sum(case((CreditLedgerEntry.entry_type == "credit", CreditLedgerEntry.amount), else_=-CreditLedgerEntry.amount))
    balances_stmt = (
        select(CreditLedgerEntry.customer_id, balance_delta)
        .where(CreditLedgerEntry.shop_id == shop_id)
        .group_by(CreditLedgerEntry.customer_id)
    )
    balances = [float(b) for _, b in (await db.execute(balances_stmt)).all()]
    pending_credit_count = sum(1 for b in balances if b > 0)
    pending_credit_amount = round(sum(b for b in balances if b > 0), 2)

    low_stock_stmt = (
        select(Medicine.id, Medicine.reorder_level, func.coalesce(func.sum(Batch.qty), 0))
        .outerjoin(Batch, (Batch.medicine_id == Medicine.id) & (Batch.shop_id == shop_id))
        .where(Medicine.shop_id == shop_id)
        .group_by(Medicine.id, Medicine.reorder_level)
    )
    low_stock_rows = (await db.execute(low_stock_stmt)).all()
    low_stock_count = sum(1 for _, reorder_level, stock in low_stock_rows if int(stock) <= reorder_level)

    expiring_cutoff = today + timedelta(days=30)
    expiring_stmt = select(func.count(Batch.id)).where(
        Batch.shop_id == shop_id, Batch.qty > 0, Batch.expiry_date <= expiring_cutoff
    )
    expiring_30_count = int((await db.execute(expiring_stmt)).scalar_one())

    last_week_start = start - timedelta(days=7)
    last_week_end = last_week_start + timedelta(days=1)
    wow_sales, _ = await _sales_and_count(db, shop_id, last_week_start, last_week_end)
    wow_pct = round((total_sales - wow_sales) / wow_sales * 100, 1) if wow_sales else None

    return {
        "total_sales": total_sales,
        "bill_count": bill_count,
        "profit_today": round(revenue - cogs - expenses_today, 2),
        "purchase_total": purchase_total,
        "pending_credit_count": pending_credit_count,
        "pending_credit_amount": pending_credit_amount,
        "low_stock_count": low_stock_count,
        "expiring_30_count": expiring_30_count,
        "wow_sales": wow_sales,
        "wow_pct": wow_pct,
    }


@router.get("/staff-sales", response_model=list[StaffSalesOut])
async def staff_sales(
    month: str | None = Query(default=None), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(User.name, func.coalesce(func.sum(Bill.total), 0))
        .join(User, User.id == Bill.created_by_user_id)
        .where(Bill.shop_id == shop_id, Bill.status == "active")
        .group_by(User.name)
    )
    rows = (await db.execute(stmt)).all()
    return [{"staff_name": name, "total_sales": float(total)} for name, total in rows]
