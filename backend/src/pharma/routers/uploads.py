import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse

from pharma.exceptions import DomainError, NotFoundError
from pharma.schemas.ops import FileUploadOut
from pharma.security import get_current_shop, get_current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])

_ALLOWED_MAGIC = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"%PDF": "pdf",
}
_MAX_SIZE = 10 * 1024 * 1024
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"


def _sniff_extension(header: bytes) -> str | None:
    for magic, ext in _ALLOWED_MAGIC.items():
        if header.startswith(magic):
            return ext
    return None


@router.post("", response_model=FileUploadOut)
async def upload_file(
    file: UploadFile = File(...),
    shop_id: uuid.UUID = Depends(get_current_shop),
    _user=Depends(get_current_user),
):
    """Validates by magic bytes (not client-supplied content-type, which is
    spoofable), enforces a size cap, and stores under a random UUID filename
    scoped to the shop — the client-supplied filename is never used for the
    stored path, so path traversal isn't possible."""
    content = await file.read(_MAX_SIZE + 1)
    if len(content) > _MAX_SIZE:
        raise DomainError("File exceeds 10MB limit")

    ext = _sniff_extension(content[:8])
    if not ext:
        raise DomainError("Unsupported file type — only JPG, PNG, and PDF are allowed")

    shop_dir = UPLOAD_DIR / str(shop_id)
    shop_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}.{ext}"
    (shop_dir / stored_name).write_bytes(content)

    return {"file_id": stored_name}


@router.get("/{file_id}")
async def get_upload(file_id: str, shop_id: uuid.UUID = Depends(get_current_shop), _user=Depends(get_current_user)):
    """Downloads require auth + shop membership — files are no longer served
    statically/unauthenticated as they were before."""
    path = (UPLOAD_DIR / str(shop_id) / file_id).resolve()
    if UPLOAD_DIR not in path.parents or not path.is_file():
        raise NotFoundError("File not found")
    return FileResponse(path)
