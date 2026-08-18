import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.exceptions import DomainError
from pharma.models.transient_state import TransientState
from pharma.models.user import User
from pharma.models.user_shop import UserShop
from pharma.security import create_access_token, verify_password

_TOTP_CHALLENGE_TTL = timedelta(minutes=5)


class InvalidCredentialsError(DomainError):
    status_code = 401


async def authenticate(db: AsyncSession, email: str, password: str) -> tuple[User, UserShop]:
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Invalid email or password")

    membership_stmt = select(UserShop).where(UserShop.user_id == user.id).order_by(UserShop.created_at)
    membership = (await db.execute(membership_stmt)).scalars().first()
    if membership is None:
        raise InvalidCredentialsError("User has no shop assigned")
    return user, membership


async def issue_totp_challenge(db: AsyncSession, user: User) -> str:
    temp_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(
        TransientState(
            key=f"totp_pending:{temp_token}",
            value={"user_id": str(user.id)},
            expires_at=now + _TOTP_CHALLENGE_TTL,
        )
    )
    await db.commit()
    return temp_token


async def verify_totp_challenge(db: AsyncSession, temp_token: str, code: str) -> tuple[User, UserShop]:
    row = await db.get(TransientState, f"totp_pending:{temp_token}")
    now = datetime.now(timezone.utc)
    if not row or row.expires_at < now:
        raise InvalidCredentialsError("Challenge expired or invalid")

    user = await db.get(User, uuid.UUID(row.value["user_id"]))
    if not user or not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
        raise InvalidCredentialsError("Invalid code")

    await db.delete(row)
    membership_stmt = select(UserShop).where(UserShop.user_id == user.id).order_by(UserShop.created_at)
    membership = (await db.execute(membership_stmt)).scalars().first()
    await db.commit()
    return user, membership


def issue_token_for(user: User, membership: UserShop) -> str:
    return create_access_token(user.id, membership.shop_id, membership.role, user.tokens_version)
