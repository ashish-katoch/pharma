from datetime import datetime

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base


class TransientState(Base):
    """Backs rate-limit counters, pending-2FA challenges, and bill-edit approval
    windows in Postgres instead of an in-process dict — survives restarts and works
    correctly with multiple uvicorn workers, unlike the previous implementation."""

    __tablename__ = "transient_state"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
