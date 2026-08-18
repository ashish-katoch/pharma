import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.medicine import Medicine
from pharma.schemas.ops import SyncChangesOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/changes", response_model=SyncChangesOut)
async def sync_changes(
    since: datetime | None = Query(default=None),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    pulled_at = datetime.now(timezone.utc)

    med_stmt = select(Medicine).where(Medicine.shop_id == shop_id)
    batch_stmt = select(Batch).where(Batch.shop_id == shop_id)
    if since:
        med_stmt = med_stmt.where(Medicine.updated_at > since)
        batch_stmt = batch_stmt.where(Batch.updated_at > since)

    medicines = (await db.execute(med_stmt)).scalars().all()
    batches = (await db.execute(batch_stmt)).scalars().all()

    return {
        "medicines": [
            {
                "id": str(m.id),
                "name": m.name,
                "generic_name": m.generic_name,
                "manufacturer": m.manufacturer,
                "gst_rate": float(m.gst_rate),
                "mrp": float(m.mrp),
                "unit": m.unit,
            }
            for m in medicines
        ],
        "batches": [
            {
                "id": str(b.id),
                "medicine_id": str(b.medicine_id),
                "batch_no": b.batch_no,
                "expiry_date": b.expiry_date.isoformat(),
                "qty": b.qty,
                "selling_price": float(b.selling_price),
            }
            for b in batches
        ],
        "pulled_at": pulled_at.isoformat(),
    }
