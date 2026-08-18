import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.bill import Bill, BillLine
from pharma.models.misc import Doctor, Expense
from pharma.models.purchase import Purchase
from pharma.models.supplier import Supplier
from pharma.models.user import User
from pharma.schemas.analytics import (
    AccountBalanceOut,
    BalanceSheetLineOut,
    CashflowOut,
    CustomerAnalyticsOut,
    DoctorAnalyticsOut,
    DoctorRevenueOut,
    PnlOut,
    PurchaseAnalyticsOut,
    SalesAnalyticsOut,
    StaffAnalyticsOut,
    StockoutRiskOut,
    VendorAnalyticsOut,
)
from pharma.security import get_current_shop

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _month_bounds(month: str) -> tuple[int, int]:
    year, mon = month.split("-")
    return int(year), int(mon)


@router.get("/sales", response_model=SalesAnalyticsOut)
async def sales_analytics(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    stmt = select(func.coalesce(func.sum(Bill.total), 0), func.count(Bill.id)).where(
        Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon
    )
    total, count = (await db.execute(stmt)).one()
    return {"month": month, "total_sales": float(total), "bill_count": int(count)}


@router.get("/staff", response_model=list[StaffAnalyticsOut])
async def staff_analytics(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    stmt = (
        select(User.name, func.coalesce(func.sum(Bill.total), 0), func.count(Bill.id))
        .join(User, User.id == Bill.created_by_user_id)
        .where(Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon)
        .group_by(User.name)
    )
    rows = (await db.execute(stmt)).all()
    return [{"staff_name": name, "total_sales": float(total), "bill_count": int(count)} for name, total, count in rows]


@router.get("/pnl", response_model=PnlOut)
async def pnl(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    # Revenue is taxable value (subtotal), not the GST-inclusive total — GST
    # collected is a liability owed to the government, not shop income.
    revenue_stmt = select(func.coalesce(func.sum(Bill.subtotal), 0)).where(
        Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon
    )
    cogs_stmt = (
        select(func.coalesce(func.sum(BillLine.qty * Batch.purchase_price), 0))
        .join(Bill, Bill.id == BillLine.bill_id)
        .join(Batch, Batch.id == BillLine.batch_id)
        .where(Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon)
    )
    expense_stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.shop_id == shop_id, extract("year", Expense.expense_date) == year, extract("month", Expense.expense_date) == mon
    )
    revenue = float((await db.execute(revenue_stmt)).scalar_one())
    cogs = float((await db.execute(cogs_stmt)).scalar_one())
    expenses = float((await db.execute(expense_stmt)).scalar_one())
    return {
        "month": month,
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "expenses": expenses,
        "profit": round(revenue - cogs - expenses, 2),
    }


@router.get("/doctors", response_model=DoctorAnalyticsOut)
async def doctor_analytics(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(func.count(Doctor.id)).where(Doctor.shop_id == shop_id)
    count = (await db.execute(stmt)).scalar_one()
    return {"month": month, "doctor_count": int(count)}


@router.get("/doctor-revenue", response_model=list[DoctorRevenueOut])
async def doctor_revenue(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    stmt = (
        select(Doctor.id, Doctor.name, func.count(Bill.id), func.coalesce(func.sum(Bill.total), 0))
        .join(Bill, Bill.doctor_id == Doctor.id)
        .where(
            Doctor.shop_id == shop_id, Bill.status == "active",
            extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon,
        )
        .group_by(Doctor.id, Doctor.name)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"doctor_id": did, "doctor_name": name, "bill_count": int(count), "revenue": float(revenue)}
        for did, name, count, revenue in rows
    ]


@router.get("/purchases", response_model=PurchaseAnalyticsOut)
async def purchase_analytics(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    stmt = select(func.coalesce(func.sum(Purchase.total), 0), func.count(Purchase.id)).where(
        Purchase.shop_id == shop_id, extract("year", Purchase.created_at) == year, extract("month", Purchase.created_at) == mon
    )
    total, count = (await db.execute(stmt)).one()
    return {"month": month, "total_purchases": float(total), "purchase_count": int(count)}


@router.get("/vendors", response_model=list[VendorAnalyticsOut])
async def vendor_analytics(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Supplier.name, func.coalesce(func.sum(Purchase.total), 0))
        .join(Purchase, Purchase.supplier_id == Supplier.id)
        .where(Supplier.shop_id == shop_id)
        .group_by(Supplier.name)
    )
    rows = (await db.execute(stmt)).all()
    return [{"supplier_name": name, "total_purchased": float(total)} for name, total in rows]


@router.get("/customers", response_model=CustomerAnalyticsOut)
async def customer_analytics(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    stmt = select(func.count(func.distinct(Bill.customer_id))).where(
        Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon
    )
    count = (await db.execute(stmt)).scalar_one()
    return {"month": month, "distinct_customers": int(count or 0)}


@router.get("/trial-balance", response_model=list[AccountBalanceOut])
async def trial_balance(
    date_from: date = Query(), date_to: date = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    from pharma.models.misc import JournalLine, JournalEntry

    stmt = (
        select(JournalLine.account, func.coalesce(func.sum(JournalLine.debit), 0), func.coalesce(func.sum(JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .where(JournalEntry.shop_id == shop_id, JournalEntry.entry_date >= date_from, JournalEntry.entry_date <= date_to)
        .group_by(JournalLine.account)
    )
    rows = (await db.execute(stmt)).all()
    return [{"account": acc, "debit": float(d), "credit": float(c)} for acc, d, c in rows]


@router.get("/balance-sheet", response_model=list[BalanceSheetLineOut])
async def balance_sheet(as_of: date = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    from pharma.models.misc import JournalLine, JournalEntry

    stmt = (
        select(JournalLine.account, func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .where(JournalEntry.shop_id == shop_id, JournalEntry.entry_date <= as_of)
        .group_by(JournalLine.account)
    )
    rows = (await db.execute(stmt)).all()
    return [{"account": acc, "balance": float(bal)} for acc, bal in rows]


@router.get("/cashflow", response_model=CashflowOut)
async def cashflow(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = _month_bounds(month)
    inflow_stmt = select(func.coalesce(func.sum(Bill.total), 0)).where(
        Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon
    )
    outflow_stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.shop_id == shop_id, extract("year", Expense.expense_date) == year, extract("month", Expense.expense_date) == mon
    )
    inflow = float((await db.execute(inflow_stmt)).scalar_one())
    outflow = float((await db.execute(outflow_stmt)).scalar_one())
    return {"month": month, "inflow": inflow, "outflow": outflow, "net": round(inflow - outflow, 2)}


@router.get("/stockout-risk", response_model=list[StockoutRiskOut])
async def stockout_risk(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    from pharma.models.batch import Batch
    from pharma.models.medicine import Medicine

    stmt = (
        select(Medicine.id, Medicine.name, func.coalesce(func.sum(Batch.qty), 0))
        .outerjoin(Batch, (Batch.medicine_id == Medicine.id) & (Batch.shop_id == shop_id))
        .where(Medicine.shop_id == shop_id)
        .group_by(Medicine.id, Medicine.name)
        .having(func.coalesce(func.sum(Batch.qty), 0) <= 5)
    )
    rows = (await db.execute(stmt)).all()
    return [{"medicine_id": str(mid), "name": name, "stock": int(qty)} for mid, name, qty in rows]
