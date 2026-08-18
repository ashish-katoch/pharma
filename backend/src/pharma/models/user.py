from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from pharma.database import Base
from pharma.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Every JWT embeds this value at issue time; bumped on password change /
    # staff deactivation so leaked tokens can be revoked. A version counter
    # (vs. comparing an issued-at timestamp) avoids clock-precision races
    # between a revoke and a same-second re-login.
    tokens_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # TOTP 2FA
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Push notifications
    push_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
