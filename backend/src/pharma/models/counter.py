import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import UUIDPrimaryKeyMixin


class Counter(UUIDPrimaryKeyMixin, Base):
    """Per-shop atomic sequence generator (bill numbers, debit notes, etc.),
    incremented via SELECT ... FOR UPDATE inside the caller's transaction."""

    __tablename__ = "counters"
    __table_args__ = (UniqueConstraint("shop_id", "name", name="uq_counters_shop_name"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[int] = mapped_column(nullable=False, default=0)
