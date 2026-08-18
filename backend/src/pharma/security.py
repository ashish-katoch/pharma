import uuid
from datetime import datetime, timedelta, timezone

import jwt
from bcrypt import checkpw, gensalt, hashpw
from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.config import get_settings
from pharma.database import get_db
from pharma.exceptions import DomainError, PermissionDeniedError
from pharma.models.user import User
from pharma.models.user_shop import UserShop

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class AuthError(DomainError):
    status_code = 401


def hash_password(plain: str) -> str:
    return hashpw(plain.encode("utf-8"), gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: uuid.UUID, shop_id: uuid.UUID, role: str, tokens_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "shop_id": str(shop_id),
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "tv": tokens_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise AuthError("Invalid or expired credentials")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise AuthError("Invalid credentials")
    user = await db.get(User, uuid.UUID(user_id))
    if not user or not user.is_active:
        raise AuthError("Invalid credentials")

    if payload.get("tv") != user.tokens_version:
        raise AuthError("Token has been revoked — please log in again")

    user._token_shop_id = payload.get("shop_id")
    user._token_role = payload.get("role")
    return user


async def get_current_shop(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Resolve + verify the shop_id carried in the token against actual membership.

    This is the single choke point that replaces the old ad-hoc `_shop_q()` filter —
    every route depends on this instead of trusting a client-supplied shop_id.
    """
    shop_id = uuid.UUID(user._token_shop_id)
    stmt = select(UserShop).where(UserShop.user_id == user.id, UserShop.shop_id == shop_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if membership is None:
        raise PermissionDeniedError("You do not have access to this shop")
    return shop_id


async def get_current_role(
    user: User = Depends(get_current_user),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
) -> str:
    stmt = select(UserShop.role).where(UserShop.user_id == user.id, UserShop.shop_id == shop_id)
    return (await db.execute(stmt)).scalar_one()


async def require_owner(role: str = Depends(get_current_role)) -> str:
    if role != "owner":
        raise PermissionDeniedError("Owner privileges required")
    return role
