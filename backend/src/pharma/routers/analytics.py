import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.bill import Bill, BillLine
from pharma.models.customer import Customer
from pharma.models.misc import Doctor, Expense
from pharma.models.purchase import Purchase
from pharma.models.supplier import Supplier
from pharma.models.user import User
from pharma.schemas.analytics import (
    AccountBalanceOut,
    BalanceSheetLineOut,
    CashflowOut,
    CashflowRangeOut,
    CustomerAnalyticsOut,
    DoctorAnalyticsOut,
    DoctorBillOut,
    DoctorRevenueOut,
    PnlDetailOut,
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


@router.get("/pnl", response_model=PnlDetailOut)
async def pnl(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    from pharma.models.purchase import Purchase

    year, mon = _month_bounds(month)
    bill_where = (Bill.shop_id == shop_id, Bill.status == "active",
                  extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon)

    # Gross revenue = subtotal + discounts (i.e. what was on the bill before discount)
    gross_rev_stmt = select(
        func.coalesce(func.sum(Bill.subtotal + Bill.discount), 0)
    ).where(*bill_where)
    discount_stmt = select(func.coalesce(func.sum(Bill.discount), 0)).where(*bill_where)
    revenue_stmt = select(func.coalesce(func.sum(Bill.subtotal), 0)).where(*bill_where)
    bill_count_stmt = select(func.count(Bill.id)).where(*bill_where)
    cogs_stmt = (
        select(func.coalesce(func.sum(BillLine.qty * Batch.purchase_price), 0))
        .join(Bill, Bill.id == BillLine.bill_id)
        .join(Batch, Batch.id == BillLine.batch_id)
        .where(*bill_where)
    )
    exp_total_stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.shop_id == shop_id,
        extract("year", Expense.expense_date) == year,
        extract("month", Expense.expense_date) == mon,
    )
    exp_by_cat_stmt = (
        select(Expense.category, func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.shop_id == shop_id,
            extract("year", Expense.expense_date) == year,
            extract("month", Expense.expense_date) == mon,
        )
        .group_by(Expense.category)
    )
    purchase_count_stmt = select(func.count(Purchase.id)).where(
        Purchase.shop_id == shop_id,
        extract("year", Purchase.created_at) == year,
        extract("month", Purchase.created_at) == mon,
    )

    gross_rev = float((await db.execute(gross_rev_stmt)).scalar_one())
    discounts = float((await db.execute(discount_stmt)).scalar_one())
    revenue = float((await db.execute(revenue_stmt)).scalar_one())
    bill_count = int((await db.execute(bill_count_stmt)).scalar_one())
    cogs = float((await db.execute(cogs_stmt)).scalar_one())
    total_expenses = float((await db.execute(exp_total_stmt)).scalar_one())
    exp_by_cat = [(cat, float(amt)) for cat, amt in (await db.execute(exp_by_cat_stmt)).all()]
    purchase_count = int((await db.execute(purchase_count_stmt)).scalar_one())

    gross_profit = round(revenue - cogs, 2)
    net_profit = round(gross_profit - total_expenses, 2)
    margin_pct = round((net_profit / revenue * 100), 1) if revenue > 0 else 0.0

    return {
        "month": month,
        "gross_revenue": round(gross_rev, 2),
        "discounts_given": round(discounts, 2),
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": gross_profit,
        "total_expenses": round(total_expenses, 2),
        "net_profit": net_profit,
        "margin_pct": margin_pct,
        "bill_count": bill_count,
        "purchase_count": purchase_count,
        "expenses_by_category": [{"category": cat, "amount": amt} for cat, amt in exp_by_cat],
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


@router.get("/doctor-bills", response_model=list[DoctorBillOut])
async def doctor_bills(
    doctor_id: uuid.UUID = Query(),
    month: str = Query(),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    year, mon = _month_bounds(month)
    stmt = (
        select(Bill.id, Bill.bill_no, Bill.total, Bill.created_at, Customer.name)
        .outerjoin(Customer, Bill.customer_id == Customer.id)
        .where(
            Bill.shop_id == shop_id,
            Bill.doctor_id == doctor_id,
            Bill.status == "active",
            extract("year", Bill.created_at) == year,
            extract("month", Bill.created_at) == mon,
        )
        .order_by(Bill.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"id": bid, "bill_no": bn, "total": float(tot), "created_at": ca.isoformat(), "customer_name": cn}
        for bid, bn, tot, ca, cn in rows
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


@router.get("/cashflow", response_model=CashflowRangeOut)
async def cashflow(
    date_from: str = Query(),
    date_to: str = Query(),
    mode: str = Query(default="all"),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_type, timedelta

    d_from = date_type.fromisoformat(date_from)
    d_to = date_type.fromisoformat(date_to)

    # Build all calendar dates in range
    all_dates = []
    cur = d_from
    while cur <= d_to:
        all_dates.append(cur)
        cur += timedelta(days=1)

    # Bills: day → cash_in (optionally filtered by payment mode)
    cash_modes = {"cash"}
    bank_modes = {"upi", "card", "bank", "cheque", "neft", "rtgs"}

    bill_stmt = select(
        func.date(Bill.created_at).label("day"),
        func.coalesce(func.sum(Bill.total), 0).label("total"),
    ).where(
        Bill.shop_id == shop_id,
        Bill.status == "active",
        func.date(Bill.created_at) >= d_from,
        func.date(Bill.created_at) <= d_to,
    )
    if mode == "cash":
        bill_stmt = bill_stmt.where(Bill.payment_mode.in_(cash_modes))
    elif mode == "bank":
        bill_stmt = bill_stmt.where(Bill.payment_mode.in_(bank_modes))
    bill_stmt = bill_stmt.group_by(func.date(Bill.created_at))
    bill_rows = {str(row.day): float(row.total) for row in (await db.execute(bill_stmt)).all()}

    # Expenses: day → cash_out
    exp_stmt = select(
        Expense.expense_date.label("day"),
        func.coalesce(func.sum(Expense.amount), 0).label("total"),
    ).where(
        Expense.shop_id == shop_id,
        Expense.expense_date >= d_from,
        Expense.expense_date <= d_to,
    ).group_by(Expense.expense_date)
    exp_rows = {str(row.day): float(row.total) for row in (await db.execute(exp_stmt)).all()}

    days = []
    for d in all_dates:
        key = str(d)
        cash_in = bill_rows.get(key, 0.0)
        cash_out = exp_rows.get(key, 0.0)
        days.append({"date": key, "cash_in": cash_in, "cash_out": cash_out, "net": round(cash_in - cash_out, 2)})

    total_in = sum(r["cash_in"] for r in days)
    total_out = sum(r["cash_out"] for r in days)
    return {"days": days, "total_in": round(total_in, 2), "total_out": round(total_out, 2), "net": round(total_in - total_out, 2)}


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
