import uuid

from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BillVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Snapshot of a bill's state taken immediately before each edit is applied."""

    __tablename__ = "bill_versions"

    bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edited_by_email: Mapped[str] = mapped_column(String(255), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)


class Return(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "returns"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    total: Mapped[float] = mapped_column(nullable=False, default=0)

    lines: Mapped[list["ReturnLine"]] = relationship(
        back_populates="return_", lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )


class ReturnLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "return_lines"

    return_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("returns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_line_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bill_lines.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False)
    qty: Mapped[int] = mapped_column(nullable=False)
    refund_amount: Mapped[float] = mapped_column(nullable=False, default=0)

    return_: Mapped["Return"] = relationship(back_populates="lines")
