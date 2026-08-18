import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)


class CustomerUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)


class CustomerOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    address: str | None
    loyalty_points: int
    outstanding_balance: float = 0

    model_config = {"from_attributes": True}


class CreditLedgerIn(BaseModel):
    entry_type: str = Field(pattern="^(credit|payment)$")
    amount: float = Field(gt=0)
    notes: str | None = Field(default=None, max_length=500)


class CreditLedgerOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    amount: float
    notes: str | None

    model_config = {"from_attributes": True}


class CustomerLedgerEntryOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    amount: float
    notes: str | None
    bill_id: uuid.UUID | None
    created_at: datetime
    balance_after: float

    model_config = {"from_attributes": True}


class CustomerLedgerOut(BaseModel):
    customer: CustomerOut
    entries: list[CustomerLedgerEntryOut]
