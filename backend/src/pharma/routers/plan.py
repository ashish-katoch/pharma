import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.organization import Organization
from pharma.models.shop import Shop
from pharma.schemas.ops import PlanFeaturesOut, StoreConfigOut
from pharma.security import get_current_shop, require_owner

router = APIRouter(tags=["plan"])

_PLAN_FEATURES = {
    "free": {"max_shops": 1, "analytics": False, "gst_reports": True},
    "pro": {"max_shops": 5, "analytics": True, "gst_reports": True},
    "enterprise": {"max_shops": 999, "analytics": True, "gst_reports": True},
}


@router.get("/plan/features", response_model=PlanFeaturesOut)
async def plan_features(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    shop = await db.get(Shop, shop_id)
    org = await db.get(Organization, shop.organization_id)
    return {"plan": org.plan, "features": _PLAN_FEATURES.get(org.plan, _PLAN_FEATURES["free"])}


@router.post("/plan/upgrade", response_model=PlanFeaturesOut)
async def upgrade_plan(
    plan: str,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    if plan not in _PLAN_FEATURES:
        from pharma.exceptions import DomainError

        raise DomainError("Unknown plan")
    shop = await db.get(Shop, shop_id)
    org = await db.get(Organization, shop.organization_id)
    org.plan = plan
    await db.commit()
    return {"plan": org.plan, "features": _PLAN_FEATURES[org.plan]}


@router.get("/store-config", response_model=StoreConfigOut)
async def store_config(shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    shop = await db.get(Shop, shop_id)
    return {"vertical": shop.vertical, "gstin": shop.gstin, "name": shop.name}
