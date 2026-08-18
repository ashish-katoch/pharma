import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import DomainError, NotFoundError
from pharma.models.bill import Bill
from pharma.models.bill_version import BillVersion, Return
from pharma.models.user import User
from pharma.schemas.bill import BillCreateIn, BillEditIn, BillOut, BillVersionOut, ReturnCreateIn, ReturnOut
from pharma.security import get_current_role, get_current_shop, get_current_user
from pharma.services import billing_service

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=list[BillOut])
async def list_bills(
    invoice_no: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Bill).where(Bill.shop_id == shop_id)
    if invoice_no:
        stmt = stmt.where(Bill.bill_no == invoice_no)
    stmt = stmt.order_by(Bill.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.get("/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    return bill


@router.post("", response_model=BillOut)
async def create_bill(
    payload: BillCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await billing_service.create_bill(db, shop_id, user.id, payload)


@router.put("/{bill_id}", response_model=BillOut)
async def edit_bill(
    bill_id: uuid.UUID,
    payload: BillEditIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: AsyncSession = Depends(get_db),
):
    bill, applied = await billing_service.edit_bill(db, shop_id, bill_id, user.email, role == "owner", payload)
    if not applied:
        # Staff-submitted edit is staged pending owner approval; bill returned unchanged.
        return bill
    return bill


@router.post("/{bill_id}/approve-edit", response_model=BillOut)
async def approve_bill_edit(
    bill_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: AsyncSession = Depends(get_db),
):
    if role != "owner":
        raise DomainError("Owner privileges required to approve an edit")
    return await billing_service.approve_edit(db, shop_id, bill_id, user.email)


@router.get("/{bill_id}/versions", response_model=list[BillVersionOut])
async def list_bill_versions(bill_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    stmt = select(BillVersion).where(BillVersion.bill_id == bill_id).order_by(BillVersion.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/{bill_id}/return", response_model=ReturnOut)
async def return_bill_lines(
    bill_id: uuid.UUID,
    payload: ReturnCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    return await billing_service.create_return(db, shop_id, bill_id, payload)


@router.get("/{bill_id}/returns", response_model=list[ReturnOut])
async def list_bill_returns(bill_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    stmt = select(Return).where(Return.shop_id == shop_id, Return.bill_id == bill_id).order_by(Return.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/{bill_id}/cancel", response_model=BillOut)
async def cancel_bill(bill_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    if bill.status == "cancelled":
        raise DomainError("Bill already cancelled")
    bill.status = "cancelled"
    await db.commit()
    return bill
