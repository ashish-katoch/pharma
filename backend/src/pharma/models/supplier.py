import uuid

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Supplier(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "suppliers"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)


class SupplierPayment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "supplier_payments"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="cash")
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class SupplierPrice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Last known purchase price from a specific supplier for a medicine."""
    __tablename__ = "supplier_prices"
    __table_args__ = (UniqueConstraint("shop_id", "supplier_id", "medicine_id", name="uq_supplier_prices_shop_sup_med"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
