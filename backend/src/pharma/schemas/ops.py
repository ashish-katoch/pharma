import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class OkOut(BaseModel):
    ok: bool = True


class TodayStatsOut(BaseModel):
    total_sales: float
    bill_count: int
    profit_today: float
    purchase_total: float
    pending_credit_count: int
    pending_credit_amount: float
    low_stock_count: int
    expiring_30_count: int
    wow_sales: float
    wow_pct: float | None


class StaffSalesOut(BaseModel):
    staff_name: str
    total_sales: float


class LedgerEntryOut(BaseModel):
    type: str
    id: uuid.UUID
    amount: float
    created_at: str


class SyncMedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    generic_name: str | None
    manufacturer: str | None
    gst_rate: float
    mrp: float
    unit: str


class SyncBatchOut(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_no: str
    expiry_date: str
    qty: int
    selling_price: float


class SyncChangesOut(BaseModel):
    medicines: list[SyncMedicineOut]
    batches: list[SyncBatchOut]
    pulled_at: str


class PlanFeaturesOut(BaseModel):
    plan: str
    features: dict


class StoreConfigOut(BaseModel):
    vertical: str
    gstin: str | None
    name: str


class PreferredSupplierOut(BaseModel):
    id: uuid.UUID
    name: str


class ReorderLineOut(BaseModel):
    medicine_id: uuid.UUID
    name: str
    stock: int
    reorder_level: int
    suggested_qty: int
    preferred_supplier: PreferredSupplierOut | None = None


class DraftPoLineOut(BaseModel):
    medicine_id: uuid.UUID
    name: str
    suggested_qty: int
    preferred_supplier: PreferredSupplierOut | None = None


class DraftPurchaseOrderOut(BaseModel):
    draft: bool
    lines: list[DraftPoLineOut]


class CreatePaymentOrderOut(BaseModel):
    order_id: str
    amount: float
    currency: str
    key_id: str


class PaymentOrderOut(BaseModel):
    id: uuid.UUID
    razorpay_order_id: str
    amount: float
    status: str

    model_config = {"from_attributes": True}


class PushTokenOut(BaseModel):
    token: str | None


class AuditEventOut(BaseModel):
    id: uuid.UUID
    actor_email: str
    action: str
    entity: str
    entity_id: str
    details: dict | None
    created_at: str


class BackupMedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    mrp: float


class BackupSupplierOut(BaseModel):
    id: uuid.UUID
    name: str


class BackupBillOut(BaseModel):
    id: uuid.UUID
    bill_no: str
    total: float
    status: str


class BackupExportOut(BaseModel):
    generated_at: str
    medicines: list[BackupMedicineOut]
    suppliers: list[BackupSupplierOut]
    bills: list[BackupBillOut]
    customer_count: int
    note: str


class PurgeResultOut(BaseModel):
    purged_transient_state_rows: int


class EodPreviewOut(BaseModel):
    close_date: date
    expected_cash: float


class LoyaltyOut(BaseModel):
    loyalty_points: int


class PriceHistoryEntryOut(BaseModel):
    purchase_price: float
    selling_price: float
    recorded_at: str


class FileUploadOut(BaseModel):
    file_id: str


class ScanResultOut(BaseModel):
    parsed: bool
    lines: list
    note: str


class ShiftOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    clock_in: datetime
    clock_out: datetime | None

    model_config = {"from_attributes": True}


class EodCloseIn(BaseModel):
    close_date: date
    counted_cash: float = Field(ge=0)
    notes: str | None = Field(default=None, max_length=500)


class EodCloseOut(BaseModel):
    id: uuid.UUID
    close_date: date
    expected_cash: float
    counted_cash: float
    variance: float
    notes: str | None

    model_config = {"from_attributes": True}


class SupplierReturnLineIn(BaseModel):
    batch_id: uuid.UUID
    qty: int = Field(gt=0)


class SupplierReturnIn(BaseModel):
    supplier_id: uuid.UUID
    debit_note_no: str = Field(min_length=1, max_length=50)
    lines: list[SupplierReturnLineIn] = Field(min_length=1)


class SupplierReturnOut(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID
    debit_note_no: str
    total: float

    model_config = {"from_attributes": True}
