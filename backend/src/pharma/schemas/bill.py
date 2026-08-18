import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class BillLineIn(BaseModel):
    medicine_id: uuid.UUID
    qty: int = Field(gt=0)


class BillCreateIn(BaseModel):
    customer_id: uuid.UUID | None = None
    doctor_id: uuid.UUID | None = None
    rx_no: str | None = Field(default=None, max_length=100)
    diagnosis: str | None = Field(default=None, max_length=500)
    payment_mode: str = Field(default="cash", pattern="^(cash|card|upi|credit)$")
    payment_mode_2: str | None = Field(default=None, pattern="^(cash|card|upi|credit)$")
    amount_mode_1: float | None = Field(default=None, ge=0)
    amount_mode_2: float | None = Field(default=None, ge=0)
    discount: float = Field(default=0, ge=0)
    lines: list[BillLineIn] = Field(min_length=1)
    client_request_id: str | None = Field(default=None, max_length=100)


class BillLineOut(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_id: uuid.UUID
    qty: int
    unit_price: float
    gst_rate: float
    line_total: float
    returned_qty: int

    model_config = {"from_attributes": True}


class BillEditIn(BaseModel):
    discount: float = Field(default=0, ge=0)
    lines: list[BillLineIn] = Field(min_length=1)
    reason: str = Field(min_length=1, max_length=500)


class BillVersionOut(BaseModel):
    id: uuid.UUID
    edited_by_email: str
    snapshot: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ReturnLineIn(BaseModel):
    bill_line_id: uuid.UUID
    qty: int = Field(gt=0)


class ReturnCreateIn(BaseModel):
    lines: list[ReturnLineIn] = Field(min_length=1)


class ReturnLineOut(BaseModel):
    id: uuid.UUID
    bill_line_id: uuid.UUID
    batch_id: uuid.UUID
    qty: int
    refund_amount: float

    model_config = {"from_attributes": True}


class ReturnOut(BaseModel):
    id: uuid.UUID
    bill_id: uuid.UUID
    total: float
    created_at: datetime
    lines: list[ReturnLineOut] = []

    model_config = {"from_attributes": True}


class BillOut(BaseModel):
    id: uuid.UUID
    bill_no: str
    customer_id: uuid.UUID | None
    doctor_id: uuid.UUID | None
    rx_no: str | None
    diagnosis: str | None
    subtotal: float
    discount: float
    gst_amount: float
    total: float
    payment_mode: str
    payment_mode_2: str | None
    amount_mode_1: float | None
    amount_mode_2: float | None
    status: str
    created_at: datetime
    lines: list[BillLineOut] = []

    model_config = {"from_attributes": True}
