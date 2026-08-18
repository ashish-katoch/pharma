import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.audit_event import AuditEvent
from pharma.schemas.ops import AuditEventOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=list[AuditEventOut])
async def list_audit_events(
    limit: int = Query(default=200, le=1000),
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AuditEvent).where(AuditEvent.shop_id == shop_id).order_by(AuditEvent.created_at.desc()).limit(limit)
    events = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(e.id),
            "actor_email": e.actor_email,
            "action": e.action,
            "entity": e.entity,
            "entity_id": e.entity_id,
            "details": e.details,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
