import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str
    totp_required: bool = False
    temp_token: str | None = None


class TotpChallengeIn(BaseModel):
    temp_token: str
    code: str = Field(min_length=6, max_length=6)


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    shop_name: str = Field(min_length=1, max_length=255)
    gstin: str | None = None
    address: str | None = Field(default=None, max_length=500)


class StaffCreateIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(owner|staff)$")


class StaffUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = Field(default=None, pattern="^(owner|staff)$")
    is_active: bool | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyPasswordIn(BaseModel):
    password: str


class SwitchShopIn(BaseModel):
    shop_id: uuid.UUID


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TotpStatusOut(BaseModel):
    enabled: bool


class TotpVerifyIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)
