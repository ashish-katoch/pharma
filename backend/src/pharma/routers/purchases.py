import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.exceptions import DomainError, NotFoundError
from pharma.models.purchase import Purchase
from pharma.schemas.ops import ScanResultOut
from pharma.schemas.purchase import PurchaseCreateIn, PurchaseOut
from pharma.security import get_current_shop, require_owner
from pharma.services import inventory_service

router = APIRouter(prefix="/purchases", tags=["purchases"])

_MAX_SCAN_SIZE = 10 * 1024 * 1024
_ALLOWED_SCAN_MIME = {"image/jpeg", "image/png", "application/pdf"}


@router.post("/scan", response_model=ScanResultOut)
async def scan_invoice(file: UploadFile = File(...), _: str = Depends(require_owner)):
    """OCR parsing is not wired up in this backend (the old implementation
    hardcoded a macOS-only Tesseract path that silently failed everywhere else).
    Returns an empty structured draft the app can present for manual entry —
    use POST /purchases/from-scan once the client has filled the fields in."""
    if file.content_type not in _ALLOWED_SCAN_MIME:
        raise DomainError("Unsupported file type for scanning")
    content = await file.read(_MAX_SCAN_SIZE + 1)
    if len(content) > _MAX_SCAN_SIZE:
        raise DomainError("File exceeds 10MB limit")
    return {"parsed": False, "lines": [], "note": "OCR not configured — please enter purchase details manually"}


@router.post("/from-scan", response_model=PurchaseOut)
async def create_from_scan(
    payload: PurchaseCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await inventory_service.create_purchase(db, shop_id, payload)


@router.get("", response_model=list[PurchaseOut])
async def list_purchases(
    limit: int = Query(default=200, le=500),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Purchase).where(Purchase.shop_id == shop_id).order_by(Purchase.created_at.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.get("/{purchase_id}", response_model=PurchaseOut)
async def get_purchase(purchase_id: uuid.UUID, shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    purchase = await db.get(Purchase, purchase_id)
    if not purchase or purchase.shop_id != shop_id:
        raise NotFoundError("Purchase not found")
    return purchase


@router.post("", response_model=PurchaseOut)
async def create_purchase(
    payload: PurchaseCreateIn,
    shop_id: uuid.UUID = Depends(get_current_shop),
    _: str = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    return await inventory_service.create_purchase(db, shop_id, payload)


@router.put("/{purchase_id}/status", response_model=PurchaseOut)
async def update_purchase_status(
    purchase_id: uuid.UUID,
    status: str = Query(pattern="^(received|pending|cancelled)$"),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    purchase = await db.get(Purchase, purchase_id)
    if not purchase or purchase.shop_id != shop_id:
        raise NotFoundError("Purchase not found")
    purchase.status = status
    await db.commit()
    return purchase
