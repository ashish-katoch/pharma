import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.bill import Bill
from pharma.models.customer import Customer
from pharma.models.medicine import Medicine
from pharma.models.supplier import Supplier
from pharma.models.transient_state import TransientState
from pharma.schemas.ops import BackupExportOut, PurgeResultOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/backup", response_model=BackupExportOut)
async def backup_export(shop_id: uuid.UUID = Depends(get_current_shop), _: str = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    """Redacted export: no customer PII (phone/address) and no prescription
    data, unlike the previous implementation which dumped the full raw DB.
    For a full backup, use `pg_dump` directly against the database, not this API."""
    medicines = (await db.execute(select(Medicine).where(Medicine.shop_id == shop_id))).scalars().all()
    suppliers = (await db.execute(select(Supplier).where(Supplier.shop_id == shop_id))).scalars().all()
    bills = (await db.execute(select(Bill).where(Bill.shop_id == shop_id))).scalars().all()
    customer_count = len((await db.execute(select(Customer).where(Customer.shop_id == shop_id)))
                          .scalars().all())

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "medicines": [{"id": str(m.id), "name": m.name, "mrp": float(m.mrp)} for m in medicines],
        "suppliers": [{"id": str(s.id), "name": s.name} for s in suppliers],
        "bills": [{"id": str(b.id), "bill_no": b.bill_no, "total": float(b.total), "status": b.status} for b in bills],
        "customer_count": customer_count,
        "note": "Customer PII and prescription data are excluded from this export. Use pg_dump for a full backup.",
    }


@router.post("/purge-old-data", response_model=PurgeResultOut)
async def purge_old_data(_: str = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    result = await db.execute(delete(TransientState).where(TransientState.expires_at < cutoff))
    await db.commit()
    return {"purged_transient_state_rows": result.rowcount}
