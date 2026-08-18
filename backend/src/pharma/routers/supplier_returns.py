import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import InsufficientStockError, NotFoundError
from pharma.models.batch import Batch
from pharma.models.bill import StockLedgerEntry
from pharma.models.purchase import SupplierReturn, SupplierReturnLine
from pharma.schemas.ops import SupplierReturnIn, SupplierReturnOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/supplier-returns", tags=["supplier-returns"])


@router.get("", response_model=list[SupplierReturnOut])
async def list_supplier_returns(
    limit: int = Query(default=200, le=500), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    stmt = select(SupplierReturn).where(SupplierReturn.shop_id == shop_id).order_by(SupplierReturn.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=SupplierReturnOut)
async def create_supplier_return(
    payload: SupplierReturnIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    total = 0.0
    ret = SupplierReturn(shop_id=shop_id, supplier_id=payload.supplier_id, debit_note_no=payload.debit_note_no, total=0)
    db.add(ret)
    await db.flush()

    for line in payload.lines:
        stmt = select(Batch).where(Batch.id == line.batch_id, Batch.shop_id == shop_id).with_for_update()
        batch = (await db.execute(stmt)).scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Batch {line.batch_id} not found")
        if batch.qty < line.qty:
            raise InsufficientStockError(f"Insufficient stock in batch {line.batch_id}")
        batch.qty -= line.qty
        total += line.qty * float(batch.purchase_price)

        db.add(SupplierReturnLine(supplier_return_id=ret.id, batch_id=line.batch_id, qty=line.qty))
        db.add(
            StockLedgerEntry(
                shop_id=shop_id,
                batch_id=line.batch_id,
                movement_type="supplier_return",
                qty_delta=-line.qty,
                reference_type="supplier_return",
                reference_id=str(ret.id),
            )
        )

    ret.total = round(total, 2)
    await db.commit()
    return ret
