import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.audit import write_audit
from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.user import User
from pharma.schemas.medicine import BatchIn, BatchOut
from pharma.security import get_current_shop, get_current_user

router = APIRouter(prefix="/batches", tags=["batches"])


@router.get("", response_model=list[BatchOut])
async def list_batches(
    medicine_id: uuid.UUID | None = Query(default=None),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Batch).where(Batch.shop_id == shop_id, Batch.qty > 0).order_by(Batch.expiry_date)
    if medicine_id:
        stmt = stmt.where(Batch.medicine_id == medicine_id)
    return (await db.execute(stmt)).scalars().all()


@router.get("/by-supplier/{supplier_id}", response_model=list[BatchOut])
async def batches_by_supplier(supplier_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(Batch).where(Batch.shop_id == shop_id, Batch.supplier_id == supplier_id)
    return (await db.execute(stmt)).scalars().all()


@router.get("/expiring-soon", response_model=list[BatchOut])
async def expiring_soon(days: int = Query(default=90, le=365), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    cutoff = date.today() + timedelta(days=days)
    stmt = select(Batch).where(Batch.shop_id == shop_id, Batch.qty > 0, Batch.expiry_date <= cutoff).order_by(Batch.expiry_date)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=BatchOut)
async def create_batch(
    payload: BatchIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = Batch(shop_id=shop_id, **payload.model_dump())
    db.add(batch)
    await db.flush()  # populate batch.id (Python-side UUID default only applies at flush)
    await write_audit(db, shop_id, user.email, "create", "batch", str(batch.id), payload.model_dump(mode="json"))
    await db.commit()
    return batch
