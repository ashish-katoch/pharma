import uuid

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Medicine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "medicines"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    generic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hsn_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gst_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    mrp: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    schedule_h: Mapped[bool] = mapped_column(nullable=False, default=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="strip")
    reorder_level: Mapped[int] = mapped_column(nullable=False, default=10)
