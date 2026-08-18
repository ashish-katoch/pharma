import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Bill(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bills"
    __table_args__ = (UniqueConstraint("shop_id", "bill_no", name="uq_bills_shop_bill_no"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_no: Mapped[str] = mapped_column(String(50), nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True
    )
    rx_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    diagnosis: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    discount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    gst_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    payment_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    payment_mode_2: Mapped[str | None] = mapped_column(String(20), nullable=True)
    amount_mode_1: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    amount_mode_2: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active|cancelled
    client_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    __table_args__ = __table_args__ + (
        UniqueConstraint("shop_id", "client_request_id", name="uq_bills_shop_client_request_id"),
    )

    lines: Mapped[list["BillLine"]] = relationship(
        back_populates="bill", lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )


class BillLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bill_lines"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_bill_lines_qty_positive"),)

    bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    medicine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False)
    qty: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    gst_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    returned_qty: Mapped[int] = mapped_column(nullable=False, default=0)

    bill: Mapped["Bill"] = relationship(back_populates="lines")


class StockLedgerEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Append-only source of truth for every stock movement (sale, purchase,
    adjustment, return). batches.qty is a cached/derived value kept in sync
    within the same transaction as each movement."""

    __tablename__ = "stock_ledger"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)  # sale|purchase|adjustment|return|supplier_return
    qty_delta: Mapped[int] = mapped_column(nullable=False)  # negative for outflows
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
