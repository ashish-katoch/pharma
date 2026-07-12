"""
Pharmacy-First Billing & Inventory API
FastAPI + Motor (MongoDB), JWT auth, FEFO batch pick, GST-ready bills.
"""
import os
import logging
import uuid
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import List, Optional, Literal

import jwt
from bcrypt import hashpw, gensalt, checkpw
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("pharma")

app = FastAPI(title="Pharma Counter API")
api = APIRouter(prefix="/api")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ------------------------ Helpers ------------------------ #
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(p: str) -> str:
    return hashpw(p.encode("utf-8"), gensalt()).decode("utf-8")


def verify_password(p: str, h: str) -> bool:
    try:
        return checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def create_access_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "role": role, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    creds_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        email = payload.get("sub")
        if not email:
            raise creds_exc
    except jwt.PyJWTError:
        raise creds_exc
    user = await db.users.find_one({"email": email}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise creds_exc
    return user


async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(403, "Owner privileges required")
    return user


async def write_audit(actor_email: str, action: str, entity: str, entity_id: str, details: Optional[dict] = None):
    await db.audit_events.insert_one({
        "id": str(uuid.uuid4()),
        "actor_email": actor_email,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "details": details or {},
        "created_at": now_iso(),
    })


# ------------------------ Models ------------------------ #
class LoginResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class Shop(BaseModel):
    id: str
    name: str
    address: str = ""
    phone: str = ""
    gstin: str = ""
    dl_no: str = ""  # Drug License
    gst_rate: float = 12.0  # default GST %
    mode: str = "pharmacy"


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    dl_no: Optional[str] = None
    gst_rate: Optional[float] = None


class MedicineIn(BaseModel):
    name: str
    brand: Optional[str] = ""
    generic: Optional[str] = ""
    strength: Optional[str] = ""  # e.g. "500mg"
    pack: Optional[str] = ""  # e.g. "10 tablets", "1 strip"
    hsn: Optional[str] = ""
    schedule: Optional[str] = ""  # H, H1, X, OTC
    gst_rate: Optional[float] = 12.0
    mrp: float = 0.0
    barcode: Optional[str] = ""
    reorder_level: int = 10


class MedicineOut(MedicineIn):
    id: str
    total_stock: int = 0
    created_at: str


class BatchIn(BaseModel):
    medicine_id: str
    batch_no: str
    expiry: str  # YYYY-MM-DD
    quantity: int
    mrp: float
    purchase_price: float = 0.0


class BatchOut(BatchIn):
    id: str
    created_at: str


class BillLineIn(BaseModel):
    medicine_id: str
    quantity: int
    discount_pct: float = 0.0  # per-line discount %


class BillCreate(BaseModel):
    lines: List[BillLineIn]
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    bill_discount_pct: float = 0.0
    payment_mode: Literal["cash", "upi", "card", "credit"] = "cash"


class BillLineOut(BaseModel):
    medicine_id: str
    medicine_name: str
    strength: str
    hsn: str
    batch_id: str
    batch_no: str
    expiry: str
    quantity: int
    mrp: float
    discount_pct: float
    gst_rate: float
    taxable_amount: float
    cgst: float
    sgst: float
    line_total: float


class BillOut(BaseModel):
    id: str
    bill_no: str
    customer_name: str
    customer_phone: str
    lines: List[BillLineOut]
    subtotal: float
    total_discount: float
    taxable_total: float
    cgst_total: float
    sgst_total: float
    grand_total: float
    bill_discount_pct: float
    payment_mode: str
    status: str
    created_at: str
    created_by: str


# ------------------------ Startup / Seed ------------------------ #
STARTER_MEDICINES = [
    {"name": "Paracetamol 500mg", "brand": "Crocin", "generic": "Paracetamol", "strength": "500mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 30.0, "reorder_level": 20},
    {"name": "Azithromycin 500mg", "brand": "Azee 500", "generic": "Azithromycin", "strength": "500mg", "pack": "3 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 95.0, "reorder_level": 10},
    {"name": "Amoxicillin 500mg", "brand": "Mox", "generic": "Amoxicillin", "strength": "500mg", "pack": "10 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 65.0, "reorder_level": 15},
    {"name": "Cetirizine 10mg", "brand": "Cetzine", "generic": "Cetirizine", "strength": "10mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 22.0, "reorder_level": 25},
    {"name": "Pantoprazole 40mg", "brand": "Pantop", "generic": "Pantoprazole", "strength": "40mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 80.0, "reorder_level": 15},
    {"name": "Metformin 500mg", "brand": "Glycomet", "generic": "Metformin", "strength": "500mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 18.0, "reorder_level": 30},
    {"name": "Atorvastatin 10mg", "brand": "Atorva", "generic": "Atorvastatin", "strength": "10mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 68.0, "reorder_level": 15},
    {"name": "Amlodipine 5mg", "brand": "Amlong", "generic": "Amlodipine", "strength": "5mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 42.0, "reorder_level": 20},
    {"name": "Diclofenac 50mg", "brand": "Voveran", "generic": "Diclofenac", "strength": "50mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 36.0, "reorder_level": 15},
    {"name": "Omeprazole 20mg", "brand": "Omez", "generic": "Omeprazole", "strength": "20mg", "pack": "10 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 48.0, "reorder_level": 15},
    {"name": "Ibuprofen 400mg", "brand": "Brufen", "generic": "Ibuprofen", "strength": "400mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 28.0, "reorder_level": 20},
    {"name": "Ranitidine 150mg", "brand": "Zinetac", "generic": "Ranitidine", "strength": "150mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 25.0, "reorder_level": 15},
    {"name": "ORS Powder 21g", "brand": "Electral", "generic": "ORS", "strength": "21g", "pack": "1 sachet", "hsn": "3004", "schedule": "OTC", "gst_rate": 5.0, "mrp": 22.0, "reorder_level": 30},
    {"name": "Vitamin D3 60K", "brand": "Uprise-D3", "generic": "Cholecalciferol", "strength": "60000 IU", "pack": "4 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 120.0, "reorder_level": 10},
    {"name": "Multivitamin", "brand": "Revital", "generic": "Multivitamin", "strength": "", "pack": "10 caps", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 95.0, "reorder_level": 12},
    {"name": "Cough Syrup 100ml", "brand": "Benadryl", "generic": "Diphenhydramine", "strength": "100ml", "pack": "1 bottle", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 115.0, "reorder_level": 8},
    {"name": "Salbutamol Inhaler", "brand": "Asthalin", "generic": "Salbutamol", "strength": "100mcg", "pack": "1 unit", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 165.0, "reorder_level": 6},
    {"name": "Losartan 50mg", "brand": "Losar", "generic": "Losartan", "strength": "50mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 55.0, "reorder_level": 15},
    {"name": "Thyroxine 50mcg", "brand": "Eltroxin", "generic": "Levothyroxine", "strength": "50mcg", "pack": "100 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 140.0, "reorder_level": 10},
    {"name": "Insulin Regular", "brand": "Actrapid", "generic": "Insulin", "strength": "40IU/ml", "pack": "10ml vial", "hsn": "3004", "schedule": "H", "gst_rate": 5.0, "mrp": 165.0, "reorder_level": 5},
]


async def seed():
    # Owner + Staff
    default_users = [
        {"email": "owner@pharma.com", "password": "Owner@123", "name": "Shop Owner", "role": "owner"},
        {"email": "staff@pharma.com", "password": "Staff@123", "name": "Counter Staff", "role": "staff"},
    ]
    for u in default_users:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": u["email"],
                "name": u["name"],
                "role": u["role"],
                "hashed_password": hash_password(u["password"]),
                "created_at": now_iso(),
            })
            logger.info("Seeded user: %s", u["email"])

    # Shop
    shop = await db.shop.find_one({})
    if not shop:
        await db.shop.insert_one({
            "id": str(uuid.uuid4()),
            "name": "MediPlus Pharmacy",
            "address": "Shop 12, MG Road, Bengaluru",
            "phone": "+91 98765 43210",
            "gstin": "29ABCDE1234F1Z5",
            "dl_no": "KA-B-20-123456",
            "gst_rate": 12.0,
            "mode": "pharmacy",
            "created_at": now_iso(),
        })
        logger.info("Seeded shop")

    # Medicines + seed batches
    count = await db.medicines.count_documents({})
    if count == 0:
        for m in STARTER_MEDICINES:
            med_id = str(uuid.uuid4())
            await db.medicines.insert_one({
                "id": med_id,
                **m,
                "barcode": "",
                "created_at": now_iso(),
            })
            # add 2 batches per medicine — one near-expiry, one far
            b1_expiry = (datetime.now(timezone.utc) + timedelta(days=45)).date().isoformat()
            b2_expiry = (datetime.now(timezone.utc) + timedelta(days=400)).date().isoformat()
            await db.batches.insert_many([
                {
                    "id": str(uuid.uuid4()),
                    "medicine_id": med_id,
                    "batch_no": "B" + uuid.uuid4().hex[:6].upper(),
                    "expiry": b1_expiry,
                    "quantity": 20,
                    "mrp": m["mrp"],
                    "purchase_price": round(m["mrp"] * 0.65, 2),
                    "created_at": now_iso(),
                },
                {
                    "id": str(uuid.uuid4()),
                    "medicine_id": med_id,
                    "batch_no": "B" + uuid.uuid4().hex[:6].upper(),
                    "expiry": b2_expiry,
                    "quantity": 50,
                    "mrp": m["mrp"],
                    "purchase_price": round(m["mrp"] * 0.65, 2),
                    "created_at": now_iso(),
                },
            ])
        logger.info("Seeded %d medicines with batches", len(STARTER_MEDICINES))


@app.on_event("startup")
async def on_startup():
    await seed()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ------------------------ Auth Routes ------------------------ #
@api.get("/health")
async def health():
    return {"status": "ok", "time": now_iso()}


@api.post("/auth/login", response_model=LoginResp)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(400, "Incorrect email or password")
    token = create_access_token(user["email"], user["role"])
    return LoginResp(access_token=token, role=user["role"], email=user["email"])


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


@api.get("/auth/staff", response_model=List[UserOut])
async def list_staff(_: dict = Depends(require_owner)):
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return [UserOut(**u) for u in users]


@api.post("/auth/staff", response_model=UserOut)
async def create_staff(payload: StaffCreate, owner: dict = Depends(require_owner)):
    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(400, "Email already exists")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email,
        "name": payload.name,
        "role": "staff",
        "hashed_password": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    await write_audit(owner["email"], "create_staff", "user", user_doc["id"], {"email": payload.email})
    user_doc.pop("hashed_password", None)
    return UserOut(**user_doc)


@api.delete("/auth/staff/{staff_id}")
async def delete_staff(staff_id: str, owner: dict = Depends(require_owner)):
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] == "owner":
        raise HTTPException(400, "Cannot delete this user")
    await db.users.delete_one({"id": staff_id})
    await write_audit(owner["email"], "delete_staff", "user", staff_id)
    return {"ok": True}


# ------------------------ Shop ------------------------ #
@api.get("/shop", response_model=Shop)
async def get_shop(_: dict = Depends(get_current_user)):
    s = await db.shop.find_one({}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Shop not initialised")
    return Shop(**s)


@api.put("/shop", response_model=Shop)
async def update_shop(payload: ShopUpdate, owner: dict = Depends(require_owner)):
    updates = {k: v for k, v in payload.dict(exclude_none=True).items()}
    await db.shop.update_one({}, {"$set": updates})
    await write_audit(owner["email"], "update_shop", "shop", "shop", updates)
    s = await db.shop.find_one({}, {"_id": 0})
    return Shop(**s)


# ------------------------ Medicines ------------------------ #
async def medicine_with_stock(m: dict) -> dict:
    total = 0
    async for b in db.batches.find({"medicine_id": m["id"]}, {"_id": 0, "quantity": 1}):
        total += int(b.get("quantity", 0))
    return {**m, "total_stock": total}


@api.get("/medicines", response_model=List[MedicineOut])
async def list_medicines(
    q: Optional[str] = Query(None, description="search query"),
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    query = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"generic": {"$regex": q, "$options": "i"}},
            {"barcode": q},
        ]}
    items = await db.medicines.find(query, {"_id": 0}).to_list(limit)
    result = [await medicine_with_stock(m) for m in items]
    result.sort(key=lambda x: x["name"].lower())
    return [MedicineOut(**m) for m in result]


@api.get("/medicines/{med_id}", response_model=MedicineOut)
async def get_medicine(med_id: str, _: dict = Depends(get_current_user)):
    m = await db.medicines.find_one({"id": med_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Medicine not found")
    m = await medicine_with_stock(m)
    return MedicineOut(**m)


@api.post("/medicines", response_model=MedicineOut)
async def create_medicine(payload: MedicineIn, user: dict = Depends(get_current_user)):
    doc = payload.dict()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.medicines.insert_one(doc)
    await write_audit(user["email"], "create_medicine", "medicine", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return MedicineOut(**{**doc, "total_stock": 0})


@api.put("/medicines/{med_id}", response_model=MedicineOut)
async def update_medicine(med_id: str, payload: MedicineIn, user: dict = Depends(get_current_user)):
    updates = payload.dict()
    result = await db.medicines.update_one({"id": med_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Medicine not found")
    await write_audit(user["email"], "update_medicine", "medicine", med_id, updates)
    m = await db.medicines.find_one({"id": med_id}, {"_id": 0})
    m = await medicine_with_stock(m)
    return MedicineOut(**m)


@api.delete("/medicines/{med_id}")
async def delete_medicine(med_id: str, owner: dict = Depends(require_owner)):
    await db.medicines.delete_one({"id": med_id})
    await db.batches.delete_many({"medicine_id": med_id})
    await write_audit(owner["email"], "delete_medicine", "medicine", med_id)
    return {"ok": True}


class BulkImport(BaseModel):
    medicines: List[MedicineIn]


@api.post("/medicines/bulk")
async def bulk_import(payload: BulkImport, user: dict = Depends(get_current_user)):
    docs = []
    for m in payload.medicines:
        d = m.dict()
        d["id"] = str(uuid.uuid4())
        d["created_at"] = now_iso()
        docs.append(d)
    if docs:
        await db.medicines.insert_many(docs)
        await write_audit(user["email"], "bulk_import", "medicine", "bulk", {"count": len(docs)})
    return {"ok": True, "inserted": len(docs)}


# ------------------------ Batches ------------------------ #
@api.get("/batches", response_model=List[BatchOut])
async def list_batches(medicine_id: str = Query(...), _: dict = Depends(get_current_user)):
    batches = await db.batches.find({"medicine_id": medicine_id}, {"_id": 0}).to_list(500)
    batches.sort(key=lambda b: b["expiry"])
    return [BatchOut(**b) for b in batches]


@api.post("/batches", response_model=BatchOut)
async def create_batch(payload: BatchIn, user: dict = Depends(get_current_user)):
    med = await db.medicines.find_one({"id": payload.medicine_id})
    if not med:
        raise HTTPException(404, "Medicine not found")
    doc = payload.dict()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.batches.insert_one(doc)
    # ledger
    await db.stock_ledger.insert_one({
        "id": str(uuid.uuid4()),
        "medicine_id": payload.medicine_id,
        "batch_id": doc["id"],
        "change": payload.quantity,
        "type": "stock_in",
        "reference": None,
        "actor": user["email"],
        "created_at": now_iso(),
    })
    await write_audit(user["email"], "stock_in", "batch", doc["id"], {
        "medicine_id": payload.medicine_id, "batch_no": payload.batch_no, "qty": payload.quantity,
    })
    doc.pop("_id", None)
    return BatchOut(**doc)


# ------------------------ Bills ------------------------ #
async def _generate_bill_no() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.bills.count_documents({"bill_no": {"$regex": f"^INV-{today}"}})
    return f"INV-{today}-{(count + 1):04d}"


@api.post("/bills", response_model=BillOut)
async def create_bill(payload: BillCreate, user: dict = Depends(get_current_user)):
    if not payload.lines:
        raise HTTPException(400, "Bill has no lines")

    # Fetch all medicines & batches involved
    med_ids = list({l.medicine_id for l in payload.lines})
    meds = await db.medicines.find({"id": {"$in": med_ids}}, {"_id": 0}).to_list(1000)
    med_map = {m["id"]: m for m in meds}
    missing = [mid for mid in med_ids if mid not in med_map]
    if missing:
        raise HTTPException(400, f"Unknown medicines: {missing}")

    # FEFO pick + validate stock
    picked_lines: List[dict] = []
    batch_updates: List[tuple] = []  # (batch_id, new_qty)
    ledger_docs: List[dict] = []
    subtotal = 0.0
    total_discount = 0.0
    taxable_total = 0.0
    cgst_total = 0.0
    sgst_total = 0.0

    for line in payload.lines:
        if line.quantity <= 0:
            raise HTTPException(400, "Quantity must be > 0")
        med = med_map[line.medicine_id]
        # sort batches by expiry ascending (FEFO)
        batches = await db.batches.find(
            {"medicine_id": line.medicine_id, "quantity": {"$gt": 0}},
            {"_id": 0},
        ).to_list(500)
        batches.sort(key=lambda b: b["expiry"])
        remaining = line.quantity
        gst_rate = float(med.get("gst_rate", 12.0))
        for b in batches:
            if remaining <= 0:
                break
            take = min(remaining, int(b["quantity"]))
            if take <= 0:
                continue
            # compute line amounts for THIS split
            gross = take * float(b["mrp"])
            disc = gross * (line.discount_pct / 100.0)
            taxable = gross - disc
            # GST is inclusive-of-MRP by default in India — split from taxable
            # For simplicity treat MRP as taxable base + GST already included:
            # taxable_ex_gst = taxable / (1 + gst_rate/100)
            taxable_ex = round(taxable / (1 + gst_rate / 100.0), 2)
            gst_amt = round(taxable - taxable_ex, 2)
            cgst = round(gst_amt / 2.0, 2)
            sgst = round(gst_amt - cgst, 2)
            line_total = round(taxable, 2)

            picked_lines.append({
                "medicine_id": med["id"],
                "medicine_name": med["name"],
                "strength": med.get("strength", ""),
                "hsn": med.get("hsn", ""),
                "batch_id": b["id"],
                "batch_no": b["batch_no"],
                "expiry": b["expiry"],
                "quantity": take,
                "mrp": float(b["mrp"]),
                "discount_pct": line.discount_pct,
                "gst_rate": gst_rate,
                "taxable_amount": taxable_ex,
                "cgst": cgst,
                "sgst": sgst,
                "line_total": line_total,
            })
            batch_updates.append((b["id"], int(b["quantity"]) - take))
            ledger_docs.append({
                "id": str(uuid.uuid4()),
                "medicine_id": med["id"],
                "batch_id": b["id"],
                "change": -take,
                "type": "sale",
                "actor": user["email"],
                "created_at": now_iso(),
            })
            subtotal += gross
            total_discount += disc
            taxable_total += taxable_ex
            cgst_total += cgst
            sgst_total += sgst
            remaining -= take
        if remaining > 0:
            raise HTTPException(400, f"Insufficient stock for {med['name']} (short by {remaining})")

    # Apply bill-level discount on taxable_total
    bill_disc_amt = round(taxable_total * (payload.bill_discount_pct / 100.0), 2)
    taxable_total = round(taxable_total - bill_disc_amt, 2)
    total_discount = round(total_discount + bill_disc_amt, 2)
    grand_total = round(taxable_total + cgst_total + sgst_total, 2)

    bill_no = await _generate_bill_no()
    bill_id = str(uuid.uuid4())
    bill_doc = {
        "id": bill_id,
        "bill_no": bill_no,
        "customer_name": payload.customer_name or "",
        "customer_phone": payload.customer_phone or "",
        "lines": picked_lines,
        "subtotal": round(subtotal, 2),
        "total_discount": round(total_discount, 2),
        "taxable_total": round(taxable_total, 2),
        "cgst_total": round(cgst_total, 2),
        "sgst_total": round(sgst_total, 2),
        "grand_total": grand_total,
        "bill_discount_pct": payload.bill_discount_pct,
        "payment_mode": payload.payment_mode,
        "status": "active",
        "created_at": now_iso(),
        "created_by": user["email"],
    }
    await db.bills.insert_one(bill_doc)

    # Persist batch updates + ledger
    for bid, new_qty in batch_updates:
        await db.batches.update_one({"id": bid}, {"$set": {"quantity": new_qty}})
    for ld in ledger_docs:
        ld["reference"] = bill_id
    if ledger_docs:
        await db.stock_ledger.insert_many(ledger_docs)
    await write_audit(user["email"], "create_bill", "bill", bill_id, {"bill_no": bill_no, "grand_total": grand_total})

    bill_doc.pop("_id", None)
    return BillOut(**bill_doc)


@api.get("/bills", response_model=List[BillOut])
async def list_bills(limit: int = 100, _: dict = Depends(get_current_user)):
    bills = await db.bills.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [BillOut(**b) for b in bills]


@api.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: str, _: dict = Depends(get_current_user)):
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bill not found")
    return BillOut(**b)


@api.post("/bills/{bill_id}/cancel", response_model=BillOut)
async def cancel_bill(bill_id: str, user: dict = Depends(get_current_user)):
    b = await db.bills.find_one({"id": bill_id})
    if not b:
        raise HTTPException(404, "Bill not found")
    if b.get("status") == "cancelled":
        raise HTTPException(400, "Bill already cancelled")
    # reverse stock
    for ln in b["lines"]:
        await db.batches.update_one(
            {"id": ln["batch_id"]},
            {"$inc": {"quantity": int(ln["quantity"])}},
        )
        await db.stock_ledger.insert_one({
            "id": str(uuid.uuid4()),
            "medicine_id": ln["medicine_id"],
            "batch_id": ln["batch_id"],
            "change": int(ln["quantity"]),
            "type": "cancel",
            "reference": bill_id,
            "actor": user["email"],
            "created_at": now_iso(),
        })
    await db.bills.update_one({"id": bill_id}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by": user["email"]}})
    await write_audit(user["email"], "cancel_bill", "bill", bill_id, {"bill_no": b["bill_no"]})
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return BillOut(**b)


# ------------------------ Reports ------------------------ #
@api.get("/reports/low-stock")
async def low_stock(_: dict = Depends(get_current_user)):
    meds = await db.medicines.find({}, {"_id": 0}).to_list(2000)
    out = []
    for m in meds:
        m = await medicine_with_stock(m)
        if m["total_stock"] <= int(m.get("reorder_level", 10)):
            out.append(m)
    out.sort(key=lambda x: x["total_stock"])
    return out


@api.get("/reports/expiring")
async def expiring(window: int = 90, _: dict = Depends(get_current_user)):
    """window = 30 / 60 / 90 days"""
    limit_date = (datetime.now(timezone.utc) + timedelta(days=window)).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    batches = await db.batches.find(
        {"expiry": {"$lte": limit_date, "$gte": today}, "quantity": {"$gt": 0}},
        {"_id": 0},
    ).to_list(2000)
    batches.sort(key=lambda b: b["expiry"])
    # attach medicine name
    med_ids = list({b["medicine_id"] for b in batches})
    meds = await db.medicines.find({"id": {"$in": med_ids}}, {"_id": 0}).to_list(2000)
    med_map = {m["id"]: m for m in meds}
    for b in batches:
        m = med_map.get(b["medicine_id"], {})
        b["medicine_name"] = m.get("name", "")
        b["strength"] = m.get("strength", "")
    return batches


@api.get("/stats/today")
async def stats_today(_: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    bills = await db.bills.find(
        {"created_at": {"$gte": today}, "status": "active"},
        {"_id": 0, "grand_total": 1, "id": 1},
    ).to_list(2000)
    total_sales = round(sum(b.get("grand_total", 0) for b in bills), 2)
    bill_count = len(bills)
    # low stock count
    low = await low_stock()
    # expiring in 30
    exp30 = await expiring(window=30)
    return {
        "sales_total": total_sales,
        "bill_count": bill_count,
        "low_stock_count": len(low),
        "expiring_30_count": len(exp30),
    }


# ------------------------ Audit ------------------------ #
@api.get("/audit")
async def audit_list(limit: int = 200, _: dict = Depends(require_owner)):
    events = await db.audit_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return events


# ------------------------ Include Router ------------------------ #
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
