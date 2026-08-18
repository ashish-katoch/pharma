import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import InsufficientStockError, NotFoundError
from pharma.models.batch import Batch
from pharma.models.bill import StockLedgerEntry
from pharma.models.misc import Adjustment
from pharma.schemas.purchase import AdjustmentIn, AdjustmentOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/adjustments", tags=["adjustments"])


@router.get("", response_model=list[AdjustmentOut])
async def list_adjustments(
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Adjustment).where(Adjustment.shop_id == shop_id).order_by(Adjustment.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=AdjustmentOut)
async def create_adjustment(
    payload: AdjustmentIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Batch).where(Batch.id == payload.batch_id, Batch.shop_id == shop_id).with_for_update()
    batch = (await db.execute(stmt)).scalar_one_or_none()
    if not batch:
        raise NotFoundError("Batch not found")

    new_qty = batch.qty + payload.qty_delta
    if new_qty < 0:
        raise InsufficientStockError("Adjustment would result in negative stock")
    batch.qty = new_qty

    adjustment = Adjustment(shop_id=shop_id, batch_id=payload.batch_id, qty_delta=payload.qty_delta, reason=payload.reason)
    db.add(adjustment)
    db.add(
        StockLedgerEntry(
            shop_id=shop_id,
            batch_id=payload.batch_id,
            movement_type="adjustment",
            qty_delta=payload.qty_delta,
            reference_type="adjustment",
            notes=payload.reason,
        )
    )
    await db.commit()
    return adjustment
