import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from pharma.models.organization import Organization


class Shop(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shops"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vertical: Mapped[str] = mapped_column(String(50), nullable=False, default="pharmacy")
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    invoice_prefix: Mapped[str] = mapped_column(String(20), nullable=False, default="INV")

    organization: Mapped[Organization] = relationship(back_populates="shops")
