import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Batch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "batches"
    __table_args__ = (CheckConstraint("qty >= 0", name="ck_batches_qty_non_negative"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medicine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    batch_no: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    qty: Mapped[int] = mapped_column(nullable=False, default=0)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    selling_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
