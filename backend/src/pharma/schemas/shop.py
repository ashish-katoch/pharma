import uuid

from pydantic import BaseModel, Field


class ShopOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    vertical: str
    gstin: str | None
    address: str | None

    model_config = {"from_attributes": True}


class ShopUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    gstin: str | None = None
    address: str | None = Field(default=None, max_length=500)


class ShopCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    vertical: str = Field(default="pharmacy", max_length=50)
    gstin: str | None = None
    address: str | None = Field(default=None, max_length=500)
