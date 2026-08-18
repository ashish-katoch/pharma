import uuid
from datetime import date

from pydantic import BaseModel, Field


class PurchaseLineIn(BaseModel):
    medicine_id: uuid.UUID
    batch_no: str = Field(min_length=1, max_length=100)
    expiry_date: date
    qty: int = Field(gt=0)
    purchase_price: float = Field(ge=0)
    selling_price: float = Field(ge=0)


class PurchaseCreateIn(BaseModel):
    supplier_id: uuid.UUID
    invoice_no: str | None = Field(default=None, max_length=100)
    lines: list[PurchaseLineIn] = Field(min_length=1)


class PurchaseOut(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID
    invoice_no: str | None
    total: float
    status: str

    model_config = {"from_attributes": True}


class AdjustmentIn(BaseModel):
    batch_id: uuid.UUID
    qty_delta: int
    reason: str = Field(min_length=1, max_length=255)


class AdjustmentOut(BaseModel):
    id: uuid.UUID
    batch_id: uuid.UUID
    qty_delta: int
    reason: str

    model_config = {"from_attributes": True}
