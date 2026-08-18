import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.shop import Shop
from pharma.models.user import User
from pharma.models.user_shop import UserShop
from pharma.schemas.ops import OkOut
from pharma.schemas.shop import ShopCreateIn, ShopOut, ShopUpdateIn
from pharma.security import get_current_shop, get_current_user, require_owner

router = APIRouter(tags=["shop"])


@router.get("/shop", response_model=ShopOut)
async def get_current_shop_profile(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    shop = await db.get(Shop, shop_id)
    if not shop:
        raise NotFoundError("Shop not found")
    return shop


@router.put("/shop", response_model=ShopOut)
async def update_shop(
    payload: ShopUpdateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    shop = await db.get(Shop, shop_id)
    if not shop:
        raise NotFoundError("Shop not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    await db.commit()
    return shop


@router.get("/shops", response_model=list[ShopOut])
async def list_my_shops(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Shop).join(UserShop, UserShop.shop_id == Shop.id).where(UserShop.user_id == user.id)
    return (await db.execute(stmt)).scalars().all()


@router.post("/shops", response_model=ShopOut)
async def create_shop(
    payload: ShopCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    current_shop = await db.get(Shop, shop_id)
    if not current_shop:
        raise NotFoundError("Shop not found")
    new_shop = Shop(
        organization_id=current_shop.organization_id,
        name=payload.name,
        vertical=payload.vertical,
        gstin=payload.gstin,
        address=payload.address,
    )
    db.add(new_shop)
    await db.flush()
    db.add(UserShop(user_id=user.id, shop_id=new_shop.id, role="owner"))
    await db.commit()
    return new_shop


@router.delete("/shops/{target_shop_id}", response_model=OkOut)
async def delete_shop(
    target_shop_id: uuid.UUID,
    user: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserShop).where(UserShop.user_id == user.id, UserShop.shop_id == target_shop_id)
    membership = (await db.execute(stmt)).scalar_one_or_none()
    if not membership or membership.role != "owner":
        raise NotFoundError("Shop not found")
    shop = await db.get(Shop, target_shop_id)
    if shop:
        await db.delete(shop)
    await db.commit()
    return {"ok": True}
