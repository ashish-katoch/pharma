import uuid

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Purchase(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "purchases"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    invoice_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received")


class PurchaseLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "purchase_lines"

    purchase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)
    qty: Mapped[int] = mapped_column(nullable=False)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)


class SupplierReturn(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "supplier_returns"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    debit_note_no: Mapped[str] = mapped_column(String(50), nullable=False)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)


class SupplierReturnLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "supplier_return_lines"

    supplier_return_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_returns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    qty: Mapped[int] = mapped_column(nullable=False)
