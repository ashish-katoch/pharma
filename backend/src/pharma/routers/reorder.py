import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.medicine import Medicine
from pharma.models.supplier import Supplier
from pharma.schemas.ops import DraftPurchaseOrderOut, ReorderLineOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/reorder", tags=["reorder"])


async def _below_reorder_level(db: AsyncSession, shop_id: uuid.UUID) -> list[tuple[uuid.UUID, str, int, int]]:
    stmt = (
        select(Medicine.id, Medicine.name, Medicine.reorder_level, func.coalesce(func.sum(Batch.qty), 0))
        .outerjoin(Batch, (Batch.medicine_id == Medicine.id) & (Batch.shop_id == shop_id))
        .where(Medicine.shop_id == shop_id)
        .group_by(Medicine.id, Medicine.name, Medicine.reorder_level)
    )
    rows = (await db.execute(stmt)).all()
    return [(mid, name, reorder_level, int(qty)) for mid, name, reorder_level, qty in rows if int(qty) <= reorder_level]


async def _preferred_supplier(db: AsyncSession, shop_id: uuid.UUID, medicine_id: uuid.UUID) -> dict | None:
    """The supplier of this medicine's most recently added batch — a
    reasonable default for "who do we usually reorder this from"."""
    stmt = (
        select(Supplier.id, Supplier.name)
        .join(Batch, Batch.supplier_id == Supplier.id)
        .where(Batch.shop_id == shop_id, Batch.medicine_id == medicine_id)
        .order_by(Batch.created_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    return {"id": row[0], "name": row[1]} if row else None


@router.get("/pending", response_model=list[ReorderLineOut])
async def reorder_pending(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    rows = await _below_reorder_level(db, shop_id)
    return [
        {
            "medicine_id": mid,
            "name": name,
            "stock": qty,
            "reorder_level": reorder_level,
            "suggested_qty": max(reorder_level * 2 - qty, 0),
            "preferred_supplier": await _preferred_supplier(db, shop_id, mid),
        }
        for mid, name, reorder_level, qty in rows
    ]


@router.post("/draft-po", response_model=DraftPurchaseOrderOut)
async def draft_purchase_order(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    rows = await _below_reorder_level(db, shop_id)
    lines = [
        {
            "medicine_id": mid,
            "name": name,
            "suggested_qty": max(reorder_level * 2 - qty, 0),
            "preferred_supplier": await _preferred_supplier(db, shop_id, mid),
        }
        for mid, name, reorder_level, qty in rows
    ]
    return {"draft": True, "lines": lines}
