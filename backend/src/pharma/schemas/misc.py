import uuid
from datetime import date

from pydantic import BaseModel, Field


class DoctorIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    specialization: str | None = Field(default=None, max_length=255)


class DoctorOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    specialization: str | None

    model_config = {"from_attributes": True}


class ExpenseIn(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0)
    notes: str | None = Field(default=None, max_length=500)
    expense_date: date


class ExpenseOut(BaseModel):
    id: uuid.UUID
    category: str
    amount: float
    notes: str | None
    expense_date: date

    model_config = {"from_attributes": True}


class JournalLineIn(BaseModel):
    account: str = Field(min_length=1, max_length=100)
    debit: float = Field(default=0, ge=0)
    credit: float = Field(default=0, ge=0)


class JournalEntryIn(BaseModel):
    memo: str | None = Field(default=None, max_length=500)
    entry_date: date
    lines: list[JournalLineIn] = Field(min_length=2)


class JournalLineOut(BaseModel):
    id: uuid.UUID
    account: str
    debit: float
    credit: float

    model_config = {"from_attributes": True}


class JournalEntryOut(BaseModel):
    id: uuid.UUID
    memo: str | None
    entry_date: date
    lines: list[JournalLineOut] = []

    model_config = {"from_attributes": True}
