import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.misc import Expense
from pharma.schemas.misc import ExpenseIn, ExpenseOut
from pharma.schemas.ops import OkOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    month: str | None = Query(default=None, description="YYYY-MM"),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Expense).where(Expense.shop_id == shop_id)
    if month:
        year, mon = month.split("-")
        stmt = stmt.where(extract("year", Expense.expense_date) == int(year), extract("month", Expense.expense_date) == int(mon))
    stmt = stmt.order_by(Expense.expense_date.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=ExpenseOut)
async def add_expense(payload: ExpenseIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    expense = Expense(shop_id=shop_id, **payload.model_dump())
    db.add(expense)
    await db.commit()
    return expense


@router.put("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: uuid.UUID, payload: ExpenseIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    expense = await db.get(Expense, expense_id)
    if not expense or expense.shop_id != shop_id:
        raise NotFoundError("Expense not found")
    for field, value in payload.model_dump().items():
        setattr(expense, field, value)
    await db.commit()
    return expense


@router.delete("/{expense_id}", response_model=OkOut)
async def delete_expense(
    expense_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    expense = await db.get(Expense, expense_id)
    if not expense or expense.shop_id != shop_id:
        raise NotFoundError("Expense not found")
    await db.delete(expense)
    await db.commit()
    return {"ok": True}
