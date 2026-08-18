import uuid
from datetime import datetime, timezone

import pyotp
from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.audit import write_audit
from pharma.database import get_db
from pharma.exceptions import ConflictError, DomainError, NotFoundError, PermissionDeniedError
from pharma.models.organization import Organization
from pharma.models.shop import Shop
from pharma.models.user import User
from pharma.models.user_shop import UserShop
from pharma.schemas.auth import (
    ChangePasswordIn,
    LoginResponse,
    RegisterIn,
    StaffCreateIn,
    StaffUpdateIn,
    SwitchShopIn,
    TotpChallengeIn,
    TotpSetupResponse,
    TotpStatusOut,
    TotpVerifyIn,
    UserOut,
    VerifyPasswordIn,
)
from pharma.schemas.ops import OkOut
from pharma.security import (
    get_current_role,
    get_current_shop,
    get_current_user,
    hash_password,
    require_owner,
    verify_password,
)
from pharma.services import auth_service
from pharma.services.rate_limit import (
    check_and_record_register_rate,
    check_login_rate,
    clear_login_failures,
    record_login_failure,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=LoginResponse)
async def register(
    payload: RegisterIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip = _client_ip(request)
    await check_and_record_register_rate(db, ip)

    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise ConflictError("An account with this email already exists")

    organization = Organization(name=payload.shop_name)
    db.add(organization)
    await db.flush()

    shop = Shop(organization_id=organization.id, name=payload.shop_name, gstin=payload.gstin, address=payload.address)
    db.add(shop)

    user = User(email=payload.email, name=payload.name, hashed_password=hash_password(payload.password))
    db.add(user)
    await db.flush()

    membership = UserShop(user_id=user.id, shop_id=shop.id, role="owner")
    db.add(membership)
    await db.commit()

    token = auth_service.issue_token_for(user, membership)
    return LoginResponse(access_token=token, role="owner", email=user.email)


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    ip = _client_ip(request)
    await check_login_rate(db, ip)
    try:
        user, membership = await auth_service.authenticate(db, form.username, form.password)
    except DomainError:
        await record_login_failure(db, ip)
        raise
    await clear_login_failures(db, ip)

    if user.totp_enabled:
        temp_token = await auth_service.issue_totp_challenge(db, user)
        return LoginResponse(access_token="", role=membership.role, email=user.email, totp_required=True, temp_token=temp_token)

    token = auth_service.issue_token_for(user, membership)
    return LoginResponse(access_token=token, role=membership.role, email=user.email)


@router.post("/2fa/challenge", response_model=LoginResponse)
async def totp_challenge(payload: TotpChallengeIn, db: AsyncSession = Depends(get_db)):
    user, membership = await auth_service.verify_totp_challenge(db, payload.temp_token, payload.code)
    token = auth_service.issue_token_for(user, membership)
    return LoginResponse(access_token=token, role=membership.role, email=user.email)


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user), role: str = Depends(get_current_role)):
    return UserOut(id=user.id, email=user.email, name=user.name, role=role, created_at=user.created_at)


@router.post("/switch-shop", response_model=LoginResponse)
async def switch_shop(
    payload: SwitchShopIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserShop).where(UserShop.user_id == user.id, UserShop.shop_id == payload.shop_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if membership is None:
        raise PermissionDeniedError("You do not have access to this shop")
    token = auth_service.issue_token_for(user, membership)
    return LoginResponse(access_token=token, role=membership.role, email=user.email)


@router.post("/verify-password", response_model=OkOut)
async def verify_password_route(payload: VerifyPasswordIn, user: User = Depends(get_current_user)):
    if not verify_password(payload.password, user.hashed_password):
        raise PermissionDeniedError("Incorrect password")
    return {"ok": True}


@router.post("/change-password", response_model=OkOut)
async def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise PermissionDeniedError("Incorrect current password")
    user.hashed_password = hash_password(payload.new_password)
    user.tokens_version += 1
    await db.commit()
    return {"ok": True}


@router.get("/2fa/status", response_model=TotpStatusOut)
async def totp_status(user: User = Depends(get_current_user)):
    return {"enabled": user.totp_enabled}


@router.post("/2fa/setup", response_model=TotpSetupResponse)
async def totp_setup(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    secret = pyotp.random_base32()
    user.totp_secret = secret
    await db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Pharma Counter")
    return TotpSetupResponse(secret=secret, provisioning_uri=uri)


@router.post("/2fa/enable", response_model=OkOut)
async def totp_enable(payload: TotpVerifyIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(payload.code, valid_window=1):
        raise DomainError("Invalid code")
    user.totp_enabled = True
    await db.commit()
    return {"ok": True}


@router.post("/2fa/disable", response_model=OkOut)
async def totp_disable(payload: TotpVerifyIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(payload.code, valid_window=1):
        raise DomainError("Invalid code")
    user.totp_enabled = False
    user.totp_secret = None
    await db.commit()
    return {"ok": True}


@router.get("/staff", response_model=list[UserOut])
async def list_staff(
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User, UserShop.role).join(UserShop, UserShop.user_id == User.id).where(UserShop.shop_id == shop_id)
    rows = (await db.execute(stmt)).all()
    return [UserOut(id=u.id, email=u.email, name=u.name, role=r, created_at=u.created_at) for u, r in rows]


@router.post("/staff", response_model=UserOut)
async def create_staff(
    payload: StaffCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    owner: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        member = UserShop(user_id=existing.id, shop_id=shop_id, role=payload.role)
        db.add(member)
        user = existing
    else:
        user = User(email=payload.email, name=payload.name, hashed_password=hash_password(payload.password))
        db.add(user)
        await db.flush()
        db.add(UserShop(user_id=user.id, shop_id=shop_id, role=payload.role))

    await write_audit(db, shop_id, owner.email, "create", "staff", str(user.id), {"email": payload.email, "role": payload.role})
    await db.commit()
    return UserOut(id=user.id, email=user.email, name=user.name, role=payload.role, created_at=user.created_at)


@router.put("/staff/{staff_id}", response_model=UserOut)
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    owner: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User, UserShop).join(UserShop, UserShop.user_id == User.id).where(
        User.id == staff_id, UserShop.shop_id == shop_id
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise NotFoundError("Staff member not found")
    user, membership = row

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        user.name = updates["name"]
    if "is_active" in updates:
        user.is_active = updates["is_active"]
        if not updates["is_active"]:
            user.tokens_version += 1
    if "role" in updates:
        membership.role = updates["role"]

    await write_audit(db, shop_id, owner.email, "update", "staff", str(user.id), updates)
    await db.commit()
    return UserOut(id=user.id, email=user.email, name=user.name, role=membership.role, created_at=user.created_at)


@router.delete("/staff/{staff_id}", response_model=OkOut)
async def delete_staff(
    staff_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    owner: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserShop).where(UserShop.user_id == staff_id, UserShop.shop_id == shop_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership:
        raise NotFoundError("Staff member not found")
    await db.delete(membership)
    await write_audit(db, shop_id, owner.email, "delete", "staff", str(staff_id))
    await db.commit()
    return {"ok": True}
