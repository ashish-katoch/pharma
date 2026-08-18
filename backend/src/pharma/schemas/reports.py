import uuid
from datetime import date

from pydantic import BaseModel


class LowStockItemOut(BaseModel):
    medicine_id: uuid.UUID
    name: str
    stock: int


class ExpiringBatchOut(BaseModel):
    batch_id: uuid.UUID
    medicine_name: str
    expiry_date: date
    qty: int


class GstSummaryOut(BaseModel):
    month: str
    taxable_value: float
    gst_collected: float
    total_sales: float


class Gstr1RateLineOut(BaseModel):
    gst_rate: float
    taxable_value: float


class Gstr1HsnLineOut(BaseModel):
    hsn_code: str | None
    gst_rate: float
    taxable_value: float
    cgst: float
    sgst: float
    total_tax: float
    invoice_count: int


class Gstr1Out(BaseModel):
    month: str
    rate_wise: list[Gstr1RateLineOut]
    hsn_wise: list[Gstr1HsnLineOut]


class ScheduleHSaleOut(BaseModel):
    bill_id: uuid.UUID
    bill_no: str
    date: str
    medicine_name: str
    rx_no: str | None
    doctor_name: str | None
    diagnosis: str | None
    quantity: int
