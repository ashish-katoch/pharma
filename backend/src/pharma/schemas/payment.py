from pydantic import BaseModel, Field


class CreateOrderIn(BaseModel):
    amount: float = Field(gt=0)


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PushTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=255)
