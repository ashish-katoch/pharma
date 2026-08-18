import hmac
import uuid
from hashlib import sha256

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.config import get_settings
from pharma.database import get_db
from pharma.exceptions import DomainError, NotFoundError
from pharma.models.misc import PaymentOrder
from pharma.models.user import User
from pharma.schemas.ops import CreatePaymentOrderOut, OkOut, PaymentOrderOut, PushTokenOut
from pharma.schemas.payment import CreateOrderIn, PushTokenIn, VerifyPaymentIn
from pharma.security import get_current_shop, get_current_user, require_owner

router = APIRouter(tags=["payments"])
settings = get_settings()


@router.post("/payments/create-order", response_model=CreatePaymentOrderOut)
async def create_payment_order(
    payload: CreateOrderIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise DomainError("Payment gateway not configured")

    async with httpx.AsyncClient(auth=(settings.razorpay_key_id, settings.razorpay_key_secret), timeout=10) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/orders",
            json={"amount": int(payload.amount * 100), "currency": "INR"},
        )
        resp.raise_for_status()
        order = resp.json()

    payment_order = PaymentOrder(shop_id=shop_id, razorpay_order_id=order["id"], amount=payload.amount, status="created")
    db.add(payment_order)
    await db.commit()
    return {"order_id": order["id"], "amount": payload.amount, "currency": "INR", "key_id": settings.razorpay_key_id}


@router.post("/payments/verify", response_model=OkOut)
async def verify_payment(payload: VerifyPaymentIn, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    stmt = select(PaymentOrder).where(PaymentOrder.shop_id == shop_id, PaymentOrder.razorpay_order_id == payload.razorpay_order_id)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise NotFoundError("Order not found")

    body = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    expected_sig = hmac.new(settings.razorpay_key_secret.encode(), body, sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, payload.razorpay_signature):
        raise DomainError("Invalid payment signature")

    order.status = "paid"
    await db.commit()
    return {"ok": True}


@router.get("/payments/history", response_model=list[PaymentOrderOut])
async def payment_history(
    limit: int = Query(default=100, le=500), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)
):
    stmt = select(PaymentOrder).where(PaymentOrder.shop_id == shop_id).order_by(PaymentOrder.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("/push/register", response_model=OkOut)
async def register_push_token(payload: PushTokenIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.push_token = payload.token
    await db.commit()
    return {"ok": True}


@router.get("/push/register", response_model=PushTokenOut)
async def get_push_token(user: User = Depends(get_current_user)):
    return {"token": user.push_token}
