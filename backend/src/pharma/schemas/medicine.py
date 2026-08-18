import uuid
from datetime import date

from pydantic import BaseModel, Field


class MedicineIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    generic_name: str | None = None
    manufacturer: str | None = None
    hsn_code: str | None = None
    gst_rate: float = Field(default=0, ge=0, le=100)
    mrp: float = Field(default=0, ge=0)
    schedule_h: bool = False
    unit: str = Field(default="strip", max_length=20)
    reorder_level: int = Field(default=10, ge=0)


class MedicineUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    generic_name: str | None = None
    manufacturer: str | None = None
    hsn_code: str | None = None
    gst_rate: float | None = Field(default=None, ge=0, le=100)
    mrp: float | None = Field(default=None, ge=0)
    schedule_h: bool | None = None
    unit: str | None = None
    reorder_level: int | None = Field(default=None, ge=0)


class MedicineOut(BaseModel):
    id: uuid.UUID
    name: str
    generic_name: str | None
    manufacturer: str | None
    hsn_code: str | None
    gst_rate: float
    mrp: float
    schedule_h: bool
    unit: str
    reorder_level: int
    stock_qty: int = 0

    model_config = {"from_attributes": True}


class BatchIn(BaseModel):
    medicine_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    batch_no: str = Field(min_length=1, max_length=100)
    expiry_date: date
    qty: int = Field(ge=0)
    purchase_price: float = Field(default=0, ge=0)
    selling_price: float = Field(default=0, ge=0)


class BatchOut(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    supplier_id: uuid.UUID | None
    batch_no: str
    expiry_date: date
    qty: int
    purchase_price: float
    selling_price: float

    model_config = {"from_attributes": True}
