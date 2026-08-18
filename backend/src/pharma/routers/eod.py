import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.bill import Bill
from pharma.models.misc import EodClose
from pharma.schemas.ops import EodCloseIn, EodCloseOut, EodPreviewOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/eod", tags=["eod"])


async def _expected_cash(db: AsyncSession, shop_id: uuid.UUID, close_date: date) -> float:
    start = datetime.combine(close_date, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(close_date, datetime.max.time(), tzinfo=timezone.utc)
    stmt = select(func.coalesce(func.sum(Bill.total), 0)).where(
        Bill.shop_id == shop_id,
        Bill.status == "active",
        Bill.payment_mode == "cash",
        Bill.created_at >= start,
        Bill.created_at <= end,
    )
    return float((await db.execute(stmt)).scalar_one())


@router.get("", response_model=list[EodCloseOut])
async def list_eod_closes(
    limit: int = Query(default=30, le=90), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    stmt = select(EodClose).where(EodClose.shop_id == shop_id).order_by(EodClose.close_date.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.get("/preview", response_model=EodPreviewOut)
async def preview_eod(close_date: date = Query(alias="date"), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    expected = await _expected_cash(db, shop_id, close_date)
    return {"close_date": close_date, "expected_cash": expected}


@router.post("", response_model=EodCloseOut)
async def close_eod(
    payload: EodCloseIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    expected = await _expected_cash(db, shop_id, payload.close_date)
    close = EodClose(
        shop_id=shop_id,
        close_date=payload.close_date,
        expected_cash=expected,
        counted_cash=payload.counted_cash,
        variance=round(payload.counted_cash - expected, 2),
        notes=payload.notes,
    )
    db.add(close)
    await db.commit()
    return close
