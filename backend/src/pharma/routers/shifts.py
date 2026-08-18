import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import DomainError, NotFoundError
from pharma.models.misc import Shift
from pharma.models.user import User
from pharma.schemas.ops import ShiftOut
from pharma.security import get_current_shop, get_current_user

router = APIRouter(prefix="/shifts", tags=["shifts"])


@router.get("/active", response_model=ShiftOut | None)
async def get_active_shift(user: User = Depends(get_current_user), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(Shift).where(Shift.shop_id == shop_id, Shift.user_id == user.id, Shift.clock_out.is_(None))
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get("", response_model=list[ShiftOut])
async def list_shifts(
    date_: date | None = Query(default=None, alias="date"),
    user_id: uuid.UUID | None = Query(default=None),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Shift).where(Shift.shop_id == shop_id)
    if date_:
        stmt = stmt.where(Shift.clock_in >= datetime.combine(date_, datetime.min.time(), tzinfo=timezone.utc))
    if user_id:
        stmt = stmt.where(Shift.user_id == user_id)
    return (await db.execute(stmt)).scalars().all()


@router.post("/clock-in", response_model=ShiftOut)
async def clock_in(user: User = Depends(get_current_user), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    existing = (
        await db.execute(select(Shift).where(Shift.shop_id == shop_id, Shift.user_id == user.id, Shift.clock_out.is_(None)))
    ).scalar_one_or_none()
    if existing:
        raise DomainError("Already clocked in")
    shift = Shift(shop_id=shop_id, user_id=user.id, clock_in=datetime.now(timezone.utc))
    db.add(shift)
    await db.commit()
    return shift


@router.post("/clock-out", response_model=ShiftOut)
async def clock_out(user: User = Depends(get_current_user), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(Shift).where(Shift.shop_id == shop_id, Shift.user_id == user.id, Shift.clock_out.is_(None))
    shift = (await db.execute(stmt)).scalar_one_or_none()
    if not shift:
        raise NotFoundError("No active shift")
    shift.clock_out = datetime.now(timezone.utc)
    await db.commit()
    return shift
