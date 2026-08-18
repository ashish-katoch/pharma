import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from pharma.models.audit_event import AuditEvent


async def write_audit(
    db: AsyncSession,
    shop_id: uuid.UUID,
    actor_email: str,
    action: str,
    entity: str,
    entity_id: str,
    details: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            shop_id=shop_id,
            actor_email=actor_email,
            action=action,
            entity=entity,
            entity_id=entity_id,
            details=details or {},
        )
    )
