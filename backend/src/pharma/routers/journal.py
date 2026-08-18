import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import DomainError, NotFoundError
from pharma.models.misc import JournalEntry, JournalLine
from pharma.schemas.misc import JournalEntryIn, JournalEntryOut
from pharma.schemas.ops import OkOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/journal-entries", tags=["journal"])


@router.get("", response_model=list[JournalEntryOut])
async def list_journal_entries(
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(JournalEntry).where(JournalEntry.shop_id == shop_id).order_by(JournalEntry.entry_date.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=JournalEntryOut)
async def create_journal_entry(
    payload: JournalEntryIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    total_debit = sum(line.debit for line in payload.lines)
    total_credit = sum(line.credit for line in payload.lines)
    if round(total_debit, 2) != round(total_credit, 2):
        raise DomainError("Journal entry must balance: total debits must equal total credits")

    entry = JournalEntry(shop_id=shop_id, memo=payload.memo, entry_date=payload.entry_date)
    db.add(entry)
    await db.flush()
    for line in payload.lines:
        db.add(JournalLine(journal_entry_id=entry.id, account=line.account, debit=line.debit, credit=line.credit))
    await db.commit()
    await db.refresh(entry, attribute_names=["lines"])
    return entry


@router.delete("/{entry_id}", response_model=OkOut)
async def delete_journal_entry(
    entry_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(JournalEntry, entry_id)
    if not entry or entry.shop_id != shop_id:
        raise NotFoundError("Journal entry not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}
