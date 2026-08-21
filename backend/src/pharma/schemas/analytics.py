import uuid

from pydantic import BaseModel


class SalesAnalyticsOut(BaseModel):
    month: str
    total_sales: float
    bill_count: int


class StaffAnalyticsOut(BaseModel):
    staff_name: str
    total_sales: float
    bill_count: int


class PnlOut(BaseModel):
    month: str
    revenue: float
    cogs: float
    expenses: float
    profit: float


class ExpenseCategoryRow(BaseModel):
    category: str
    amount: float


class PnlDetailOut(BaseModel):
    month: str
    gross_revenue: float
    discounts_given: float
    revenue: float
    cogs: float
    gross_profit: float
    total_expenses: float
    net_profit: float
    margin_pct: float
    bill_count: int
    purchase_count: int
    expenses_by_category: list[ExpenseCategoryRow]


class DoctorAnalyticsOut(BaseModel):
    month: str
    doctor_count: int


class DoctorRevenueOut(BaseModel):
    doctor_id: uuid.UUID
    doctor_name: str
    bill_count: int
    revenue: float


class PurchaseAnalyticsOut(BaseModel):
    month: str
    total_purchases: float
    purchase_count: int


class VendorAnalyticsOut(BaseModel):
    supplier_name: str
    total_purchased: float


class CustomerAnalyticsOut(BaseModel):
    month: str
    distinct_customers: int


class AccountBalanceOut(BaseModel):
    account: str
    debit: float
    credit: float


class BalanceSheetLineOut(BaseModel):
    account: str
    balance: float


class CashflowOut(BaseModel):
    month: str
    inflow: float
    outflow: float
    net: float


class CashflowDayRow(BaseModel):
    date: str
    cash_in: float
    cash_out: float
    net: float


class CashflowRangeOut(BaseModel):
    days: list[CashflowDayRow]
    total_in: float
    total_out: float
    net: float


class StockoutRiskOut(BaseModel):
    medicine_id: uuid.UUID
    name: str
    stock: int
