import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    gstin: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)


class SupplierOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    gstin: str | None
    address: str | None
    outstanding_balance: float = 0

    model_config = {"from_attributes": True}


class SupplierPaymentIn(BaseModel):
    amount: float = Field(gt=0)
    payment_mode: str = Field(default="cash", max_length=20)
    notes: str | None = Field(default=None, max_length=500)


class SupplierPaymentOut(BaseModel):
    id: uuid.UUID
    amount: float
    payment_mode: str
    notes: str | None

    model_config = {"from_attributes": True}


class SupplierLedgerEntryOut(BaseModel):
    type: str  # purchase | payment | return
    ref_id: uuid.UUID
    amount: float
    notes: str | None
    created_at: datetime
    balance_after: float


class SupplierLedgerOut(BaseModel):
    supplier: SupplierOut
    entries: list[SupplierLedgerEntryOut]
