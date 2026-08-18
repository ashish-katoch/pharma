import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.audit import write_audit
from pharma.database import get_db
from pharma.exceptions import NotFoundError
from pharma.models.misc import Doctor
from pharma.models.user import User
from pharma.schemas.misc import DoctorIn, DoctorOut
from pharma.schemas.ops import OkOut
from pharma.security import get_current_shop, get_current_user, require_owner

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[DoctorOut])
async def list_doctors(
    limit: int = Query(default=500, le=1000),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Doctor).where(Doctor.shop_id == shop_id).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=DoctorOut)
async def create_doctor(
    payload: DoctorIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doctor = Doctor(shop_id=shop_id, **payload.model_dump())
    db.add(doctor)
    await db.flush()  # populate doctor.id (Python-side UUID default only applies at flush)
    await write_audit(db, shop_id, user.email, "create", "doctor", str(doctor.id))
    await db.commit()
    return doctor


@router.put("/{doctor_id}", response_model=DoctorOut)
async def update_doctor(
    doctor_id: uuid.UUID,
    payload: DoctorIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    doctor = await db.get(Doctor, doctor_id)
    if not doctor or doctor.shop_id != shop_id:
        raise NotFoundError("Doctor not found")
    for field, value in payload.model_dump().items():
        setattr(doctor, field, value)
    await write_audit(db, shop_id, user.email, "update", "doctor", str(doctor_id))
    await db.commit()
    return doctor


@router.delete("/{doctor_id}", response_model=OkOut)
async def delete_doctor(
    doctor_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop),
    user: User = Depends(get_current_user),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    doctor = await db.get(Doctor, doctor_id)
    if not doctor or doctor.shop_id != shop_id:
        raise NotFoundError("Doctor not found")
    await db.delete(doctor)
    await write_audit(db, shop_id, user.email, "delete", "doctor", str(doctor_id))
    await db.commit()
    return {"ok": True}
