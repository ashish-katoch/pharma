import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


def _shop_fk():
    return mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True)


class Adjustment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "adjustments"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    qty_delta: Mapped[int] = mapped_column(nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)


class Doctor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "doctors"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Expense(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "expenses"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)


class JournalEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "journal_entries"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    memo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="entry", lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )


class JournalLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "journal_lines"

    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account: Mapped[str] = mapped_column(String(100), nullable=False)
    debit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    credit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    entry: Mapped["JournalEntry"] = relationship(back_populates="lines")


class EodClose(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "eod_closes"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    close_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_cash: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    counted_cash: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    variance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class PaymentOrder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payment_orders"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    razorpay_order_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")


class Shift(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shifts"

    shop_id: Mapped[uuid.UUID] = _shop_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    clock_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    clock_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
