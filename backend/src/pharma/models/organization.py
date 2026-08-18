from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="free")

    shops: Mapped[list["Shop"]] = relationship(back_populates="organization")  # noqa: F821
