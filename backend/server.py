"""
Pharmacy-First Billing & Inventory API
FastAPI + Motor (MongoDB), JWT auth, FEFO batch pick, GST-ready bills.
"""
import asyncio
import base64
import io
import json
import os
import logging
import random
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Dict, List, Optional, Literal

try:
    import pyotp
    _PYOTP_OK = True
except ImportError:
    _PYOTP_OK = False

import jwt
from bcrypt import hashpw, gensalt, checkpw
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status, Query, UploadFile, File
from fastapi.staticfiles import StaticFiles
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

# In-memory login rate limiter: max 10 failures per IP per 15-minute window.
_login_failures: Dict[str, list] = {}
_LOGIN_WINDOW_S = 15 * 60
_LOGIN_MAX_FAILS = 10

def _check_login_rate(ip: str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    attempts = [t for t in _login_failures.get(ip, []) if now - t < _LOGIN_WINDOW_S]
    if len(attempts) >= _LOGIN_MAX_FAILS:
        raise HTTPException(429, "Too many failed login attempts — try again later")
    _login_failures[ip] = attempts

def _record_login_failure(ip: str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    bucket = _login_failures.get(ip, [])
    bucket.append(now)
    _login_failures[ip] = bucket

def _clear_login_failures(ip: str) -> None:
    _login_failures.pop(ip, None)


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


def create_access_token(sub: str, role: str, shop_id: str = "default") -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "role": role, "shop_id": shop_id, "exp": exp}
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
    user["_shop_id"] = payload.get("shop_id", user.get("default_shop_id", "default"))
    return user


def get_shop_id(user: dict = Depends(get_current_user)) -> str:
    return user.get("_shop_id", "default")


def _shop_q(shop_id: str) -> dict:
    """Return a MongoDB filter that matches docs for this shop OR legacy docs with no shop_id."""
    return {"$or": [{"shop_id": shop_id}, {"shop_id": {"$exists": False}}]}


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
    totp_required: bool = False
    temp_token: Optional[str] = None


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


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None


class Shop(BaseModel):
    id: str
    name: str
    address: str = ""
    phone: str = ""
    gstin: str = ""
    dl_no: str = ""  # Drug License
    gst_rate: float = 12.0  # default GST %
    mode: str = "pharmacy"
    invoice_prefix: str = "INV"  # GST invoice sequence prefix
    notification_prefs: Optional[dict] = None
    plan: str = "starter"  # starter | pro
    plan_expires: Optional[str] = None
    data_retention_months: int = 60  # purge records older than N months


STORE_CONFIGS: Dict[str, dict] = {
    "pharmacy": {
        "product_label": "Medicine", "products_label": "Medicines",
        "supplier_label": "Supplier", "suppliers_label": "Suppliers",
        "batch_required": True, "expiry_tracking": True,
        "schedule_h": True, "doctor_referrals": True, "prescription": True,
        "symptom_suggest": True,
        "dl_no_label": "Drug Licence No.", "referrer_label": "Doctor",
        "lot_label": "Batch No.",
    },
    "kirana": {
        "product_label": "Product", "products_label": "Products",
        "supplier_label": "Supplier", "suppliers_label": "Suppliers",
        "batch_required": False, "expiry_tracking": True,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": None, "referrer_label": None,
        "lot_label": "Lot No.",
    },
    "optical": {
        "product_label": "Item", "products_label": "Items",
        "supplier_label": "Vendor", "suppliers_label": "Vendors",
        "batch_required": False, "expiry_tracking": False,
        "schedule_h": False, "doctor_referrals": True, "prescription": True,
        "symptom_suggest": False,
        "dl_no_label": "Optical Lic. No.", "referrer_label": "Optometrist",
        "lot_label": "Lot No.",
    },
    "surgical": {
        "product_label": "Product", "products_label": "Products",
        "supplier_label": "Supplier", "suppliers_label": "Suppliers",
        "batch_required": True, "expiry_tracking": True,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": "Drug Licence No.", "referrer_label": None,
        "lot_label": "Batch No.",
    },
    "hardware": {
        "product_label": "Product", "products_label": "Products",
        "supplier_label": "Vendor", "suppliers_label": "Vendors",
        "batch_required": False, "expiry_tracking": False,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": None, "referrer_label": None,
        "lot_label": "Lot No.",
    },
    "rental": {
        "product_label": "Equipment", "products_label": "Equipment",
        "supplier_label": "Vendor", "suppliers_label": "Vendors",
        "batch_required": False, "expiry_tracking": False,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": None, "referrer_label": None,
        "lot_label": "Asset No.",
    },
    "agri": {
        "product_label": "Product", "products_label": "Products",
        "supplier_label": "Supplier", "suppliers_label": "Suppliers",
        "batch_required": True, "expiry_tracking": True,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": None, "referrer_label": None,
        "lot_label": "Lot No.",
    },
    "clothing": {
        "product_label": "Item", "products_label": "Items",
        "supplier_label": "Vendor", "suppliers_label": "Vendors",
        "batch_required": False, "expiry_tracking": False,
        "schedule_h": False, "doctor_referrals": False, "prescription": False,
        "symptom_suggest": False,
        "dl_no_label": None, "referrer_label": None,
        "lot_label": "Style No.",
    },
}
_DEFAULT_STORE_CONFIG = STORE_CONFIGS["pharmacy"]


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    dl_no: Optional[str] = None
    gst_rate: Optional[float] = None
    mode: Optional[str] = None
    invoice_prefix: Optional[str] = None
    notification_prefs: Optional[dict] = None
    plan: Optional[str] = None
    plan_expires: Optional[str] = None
    data_retention_months: Optional[int] = None


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
    location: Optional[str] = ""  # Rack location e.g. "A-1-B" (Block-Row-Shelf)
    uom: Optional[str] = "pcs"  # pcs | kg | ltr | dz


class MedicineOut(MedicineIn):
    id: str
    total_stock: float = 0
    created_at: str


class BatchIn(BaseModel):
    medicine_id: str
    batch_no: str
    expiry: str  # YYYY-MM-DD
    quantity: float
    mrp: float
    purchase_price: float = 0.0


class BatchOut(BatchIn):
    id: str
    created_at: str


class BillLineIn(BaseModel):
    medicine_id: str
    quantity: float
    discount_pct: float = 0.0
    # When the client pre-picks a batch (offline FEFO), it sends batch_id.
    # If provided, skip FEFO and use this batch directly.
    batch_id: Optional[str] = None


class BillCreate(BaseModel):
    lines: List[BillLineIn]
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    bill_discount_pct: float = Field(0.0, ge=0.0, le=100.0)
    payment_mode: Literal["cash", "upi", "card", "credit"] = "cash"
    split_payment: Optional[List[dict]] = None
    # Client-generated UUID — makes POST idempotent: same client_id = same bill.
    client_id: Optional[str] = None
    # Schedule H / H1 prescription details (required for controlled medicines)
    rx_details: Optional[dict] = None
    # Prescription photo (base64 JPEG — for Schedule H audit defence)
    rx_photo: Optional[str] = None
    # Linked customer (optional)
    customer_id: Optional[str] = None
    # Doctor referral (optional)
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    # Loyalty points to redeem as discount (1 point = ₹1)
    loyalty_points_used: int = 0


class ReturnLineIn(BaseModel):
    medicine_id: str
    batch_id: str
    quantity: float  # how many units to return (must be <= billed quantity)


class ReturnCreate(BaseModel):
    lines: List[ReturnLineIn]
    reason: Optional[str] = ""


class ReturnLineOut(BaseModel):
    medicine_id: str
    medicine_name: str
    batch_id: str
    batch_no: str
    quantity: float
    mrp: float
    refund_amount: float


class ReturnOut(BaseModel):
    id: str
    bill_id: str
    bill_no: str
    lines: List[ReturnLineOut]
    total_refund: float
    reason: str
    created_at: str
    created_by: str


class BillLineOut(BaseModel):
    medicine_id: str
    medicine_name: str
    strength: str
    hsn: str
    batch_id: str
    batch_no: str
    expiry: str
    quantity: float
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
    sold_by_name: Optional[str] = ""
    sold_by_id: Optional[str] = ""
    rx_details: Optional[dict] = None
    rx_photo: Optional[str] = None
    customer_id: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    edited_at: Optional[str] = None
    edit_reason: Optional[str] = None
    edit_count: int = 0


class BillEditLine(BaseModel):
    medicine_id: str
    batch_id: str
    quantity: float


class BillEditIn(BaseModel):
    lines: List[BillEditLine]
    payment_mode: Optional[Literal["cash", "upi", "card", "credit"]] = None
    reason: str


# ------------------------ Startup / Seed ------------------------ #
STARTER_MEDICINES = [
    {"name": "Paracetamol 500mg", "brand": "Crocin", "generic": "Paracetamol", "strength": "500mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 30.0, "reorder_level": 20, "location": "A-1-A"},
    {"name": "Azithromycin 500mg", "brand": "Azee 500", "generic": "Azithromycin", "strength": "500mg", "pack": "3 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 95.0, "reorder_level": 10, "location": "B-1-A"},
    {"name": "Amoxicillin 500mg", "brand": "Mox", "generic": "Amoxicillin", "strength": "500mg", "pack": "10 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 65.0, "reorder_level": 15, "location": "B-1-B"},
    {"name": "Cetirizine 10mg", "brand": "Cetzine", "generic": "Cetirizine", "strength": "10mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 22.0, "reorder_level": 25, "location": "A-1-B"},
    {"name": "Pantoprazole 40mg", "brand": "Pantop", "generic": "Pantoprazole", "strength": "40mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 80.0, "reorder_level": 15, "location": "B-2-A"},
    {"name": "Metformin 500mg", "brand": "Glycomet", "generic": "Metformin", "strength": "500mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 18.0, "reorder_level": 30, "location": "B-2-B"},
    {"name": "Atorvastatin 10mg", "brand": "Atorva", "generic": "Atorvastatin", "strength": "10mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 68.0, "reorder_level": 15, "location": "B-2-C"},
    {"name": "Amlodipine 5mg", "brand": "Amlong", "generic": "Amlodipine", "strength": "5mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 42.0, "reorder_level": 20, "location": "B-3-A"},
    {"name": "Diclofenac 50mg", "brand": "Voveran", "generic": "Diclofenac", "strength": "50mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 36.0, "reorder_level": 15, "location": "B-3-B"},
    {"name": "Omeprazole 20mg", "brand": "Omez", "generic": "Omeprazole", "strength": "20mg", "pack": "10 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 48.0, "reorder_level": 15, "location": "B-3-C"},
    {"name": "Ibuprofen 400mg", "brand": "Brufen", "generic": "Ibuprofen", "strength": "400mg", "pack": "10 tablets", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 28.0, "reorder_level": 20, "location": "A-1-C"},
    {"name": "Ranitidine 150mg", "brand": "Zinetac", "generic": "Ranitidine", "strength": "150mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 25.0, "reorder_level": 15, "location": "B-4-A"},
    {"name": "ORS Powder 21g", "brand": "Electral", "generic": "ORS", "strength": "21g", "pack": "1 sachet", "hsn": "3004", "schedule": "OTC", "gst_rate": 5.0, "mrp": 22.0, "reorder_level": 30, "location": "A-2-A"},
    {"name": "Vitamin D3 60K", "brand": "Uprise-D3", "generic": "Cholecalciferol", "strength": "60000 IU", "pack": "4 caps", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 120.0, "reorder_level": 10, "location": "B-4-B"},
    {"name": "Multivitamin", "brand": "Revital", "generic": "Multivitamin", "strength": "", "pack": "10 caps", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 95.0, "reorder_level": 12, "location": "A-2-B"},
    {"name": "Cough Syrup 100ml", "brand": "Benadryl", "generic": "Diphenhydramine", "strength": "100ml", "pack": "1 bottle", "hsn": "3004", "schedule": "OTC", "gst_rate": 12.0, "mrp": 115.0, "reorder_level": 8, "location": "A-2-C"},
    {"name": "Salbutamol Inhaler", "brand": "Asthalin", "generic": "Salbutamol", "strength": "100mcg", "pack": "1 unit", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 165.0, "reorder_level": 6, "location": "C-1-A"},
    {"name": "Losartan 50mg", "brand": "Losar", "generic": "Losartan", "strength": "50mg", "pack": "10 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 55.0, "reorder_level": 15, "location": "B-5-A"},
    {"name": "Thyroxine 50mcg", "brand": "Eltroxin", "generic": "Levothyroxine", "strength": "50mcg", "pack": "100 tablets", "hsn": "3004", "schedule": "H", "gst_rate": 12.0, "mrp": 140.0, "reorder_level": 10, "location": "B-5-B"},
    {"name": "Insulin Regular", "brand": "Actrapid", "generic": "Insulin", "strength": "40IU/ml", "pack": "10ml vial", "hsn": "3004", "schedule": "H", "gst_rate": 5.0, "mrp": 165.0, "reorder_level": 5, "location": "C-1-B"},
]

# ─────────────────── Rich Demo Data ────────────────────────────── #

_DEMO_CUSTOMERS = [
    {"name": "Rajesh Kumar",  "phone": "9876543201", "address": "12, MG Road, Bengaluru",       "credit_limit": 5000.0},
    {"name": "Priya Sharma",  "phone": "9845612378", "address": "45, Koramangala, Bengaluru",   "credit_limit": 3000.0},
    {"name": "Arun Nair",     "phone": "9901234567", "address": "78, Indiranagar, Bengaluru",   "credit_limit": 0.0},
    {"name": "Sunita Reddy",  "phone": "9980765432", "address": "23, Jayanagar, Bengaluru",     "credit_limit": 0.0},
    {"name": "Vikas Mehta",   "phone": "9741234567", "address": "56, Whitefield, Bengaluru",    "credit_limit": 8000.0},
    {"name": "Meena Pillai",  "phone": "9632145678", "address": "34, Marathahalli, Bengaluru",  "credit_limit": 0.0},
    {"name": "Deepak Verma",  "phone": "9512345678", "address": "89, BTM Layout, Bengaluru",    "credit_limit": 4000.0},
    {"name": "Ananya Bose",   "phone": "9423456789", "address": "67, Hebbal, Bengaluru",        "credit_limit": 0.0},
    {"name": "Ravi Iyer",     "phone": "9314567890", "address": "11, Yelahanka, Bengaluru",     "credit_limit": 2500.0},
    {"name": "Kavitha Rao",   "phone": "9205678901", "address": "99, JP Nagar, Bengaluru",      "credit_limit": 0.0},
]

_DEMO_SUPPLIERS = [
    {"name": "Sun Pharma Distributors", "phone": "8012345678", "email": "orders@sunpharma-dist.in",      "address": "Industrial Area, Bengaluru", "gstin": "29SUNPH1234A1Z3", "dl_no": "KA-W-20-111111"},
    {"name": "Cipla MediPro",           "phone": "8023456789", "email": "supply@ciplamedipro.in",        "address": "Peenya, Bengaluru",          "gstin": "29CIPLA5678B2Z4", "dl_no": "KA-W-20-222222"},
    {"name": "Apollo HealthCo",         "phone": "8034567890", "email": "procurement@apollohealthco.in", "address": "Koramangala, Bengaluru",     "gstin": "29APOHE9012C3Z5", "dl_no": "KA-W-20-333333"},
    {"name": "MedReliance India",       "phone": "8045678901", "email": "supply@medreliance.in",         "address": "Electronic City, Bengaluru", "gstin": "29MEDRE3456D4Z6", "dl_no": "KA-W-20-444444"},
    {"name": "Zydus Wellness Direct",   "phone": "8056789012", "email": "direct@zyduswellness.in",       "address": "Rajajinagar, Bengaluru",     "gstin": "29ZYDUS7890E5Z7", "dl_no": "KA-W-20-555555"},
]

_DEMO_DOCTORS = [
    {"name": "Dr. Suresh Patel",  "phone": "9111222333", "clinic": "HealthFirst Clinic",    "speciality": "General Physician", "address": "MG Road, Bengaluru"},
    {"name": "Dr. Kavya Menon",   "phone": "9222333444", "clinic": "Menon Medical Centre",  "speciality": "Internal Medicine", "address": "Indiranagar, Bengaluru"},
    {"name": "Dr. Ramesh Nair",   "phone": "9333444555", "clinic": "Apollo Spectra",        "speciality": "Diabetologist",     "address": "Koramangala, Bengaluru"},
    {"name": "Dr. Anita Rao",     "phone": "9444555666", "clinic": "City Care Hospital",    "speciality": "Pulmonologist",     "address": "Jayanagar, Bengaluru"},
    {"name": "Dr. Pradeep Ghosh", "phone": "9555666777", "clinic": "Ghosh Heart Institute", "speciality": "Cardiologist",      "address": "Whitefield, Bengaluru"},
]


async def seed_rich_demo() -> None:
    """Seed 3 months of realistic transactions for demo / fundraising presentations."""
    if await db.customers.count_documents({}) > 0:
        return  # already seeded

    rng = random.Random(42)
    _now = now_iso()

    # 1. Customers
    customer_docs = []
    for c in _DEMO_CUSTOMERS:
        customer_docs.append({"id": str(uuid.uuid4()), **c, "outstanding": 0.0, "created_at": _now, "updated_at": _now})
    await db.customers.insert_many(customer_docs)

    # 2. Suppliers
    supplier_docs = []
    for s in _DEMO_SUPPLIERS:
        supplier_docs.append({"id": str(uuid.uuid4()), **s, "created_at": _now, "updated_at": _now})
    await db.suppliers.insert_many(supplier_docs)

    # 3. Doctors
    doctor_docs = []
    for d in _DEMO_DOCTORS:
        doctor_docs.append({"id": str(uuid.uuid4()), **d, "created_at": _now, "updated_at": _now, "created_by": "owner@pharma.com"})
    await db.doctors.insert_many(doctor_docs)

    # 4. One large "demo stock" batch per medicine (avoids depleting the original batches)
    meds = await db.medicines.find({}, {"_id": 0}).to_list(100)
    if not meds:
        logger.warning("Demo: no medicines found — skipping rich demo seed")
        return

    demo_batch_id: Dict[str, str] = {}  # medicine_id -> batch_id
    demo_remaining: Dict[str, int] = {} # batch_id -> remaining qty
    demo_batch_no: Dict[str, str] = {}  # medicine_id -> batch_no

    demo_batch_docs = []
    for med in meds:
        bid = str(uuid.uuid4())
        bno = "DEMO-" + uuid.uuid4().hex[:6].upper()
        demo_batch_id[med["id"]] = bid
        demo_batch_no[med["id"]] = bno
        demo_remaining[bid] = 600
        demo_batch_docs.append({
            "id": bid,
            "medicine_id": med["id"],
            "batch_no": bno,
            "expiry": "2027-12-31",
            "quantity": 600,
            "mrp": float(med["mrp"]),
            "purchase_price": round(float(med["mrp"]) * 0.65, 2),
            "supplier_id": supplier_docs[0]["id"],
            "created_at": _now,
            "updated_at": _now,
            "deleted": 0,
        })
    await db.batches.insert_many(demo_batch_docs)

    # 5. Purchases — one per supplier spread over last 90 days
    today_dt = datetime.now(timezone.utc)
    purchase_docs = []
    purchase_line_docs = []
    stock_ledger_docs: List[dict] = []

    for i, sup in enumerate(supplier_docs):
        days_back = rng.randint(20, 85)
        inv_dt = today_dt - timedelta(days=days_back)
        inv_ts = inv_dt.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
        pid = str(uuid.uuid4())
        total = 0.0
        p_meds = rng.sample(meds, k=rng.randint(4, 8))
        for med in p_meds:
            qty = rng.randint(50, 150)
            pp = round(float(med["mrp"]) * rng.uniform(0.55, 0.70), 2)
            total += qty * pp
            bid = demo_batch_id[med["id"]]
            purchase_line_docs.append({
                "id": str(uuid.uuid4()),
                "purchase_id": pid,
                "medicine_id": med["id"],
                "medicine_name": med["name"],
                "batch_id": bid,
                "batch_no": demo_batch_no[med["id"]],
                "expiry": "2027-12-31",
                "quantity": qty,
                "purchase_price": pp,
                "mrp": float(med["mrp"]),
                "gst_rate": float(med.get("gst_rate", 12.0)),
            })
            stock_ledger_docs.append({
                "id": str(uuid.uuid4()),
                "medicine_id": med["id"],
                "batch_id": bid,
                "change": qty,
                "type": "purchase",
                "reference": pid,
                "actor": "owner@pharma.com",
                "created_at": inv_ts,
            })
        purchase_docs.append({
            "id": pid,
            "supplier_id": sup["id"],
            "supplier_name": sup["name"],
            "invoice_no": f"SI-{inv_dt.strftime('%Y%m')}-{i+1:03d}",
            "invoice_date": inv_dt.date().isoformat(),
            "total_amount": round(total, 2),
            "paid_amount": round(total, 2),
            "payment_mode": rng.choice(["cash", "upi", "neft"]),
            "status": "received",
            "created_at": inv_ts,
            "created_by": "owner@pharma.com",
        })

    if purchase_docs:
        await db.purchases.insert_many(purchase_docs)
    if purchase_line_docs:
        await db.purchase_lines.insert_many(purchase_line_docs)

    # 6. Bills — 90 days with a growth curve (older=fewer, recent=busier)
    payment_pool = ["cash"] * 55 + ["upi"] * 30 + ["card"] * 10 + ["credit"] * 5
    discount_pool = [0] * 70 + [5] * 20 + [10] * 8 + [2] * 2

    bill_docs: List[dict] = []
    bill_counter: Dict[str, int] = {}
    credit_ledger_docs: List[dict] = []

    for days_ago in range(90, 0, -1):
        if days_ago <= 30:
            n_bills = rng.randint(1, 5)
        elif days_ago <= 60:
            n_bills = rng.randint(0, 3)
        else:
            n_bills = rng.randint(0, 2)

        for _ in range(n_bills):
            bill_dt = today_dt - timedelta(days=days_ago)
            bill_ts = bill_dt.replace(
                hour=rng.randint(8, 20), minute=rng.randint(0, 59),
                second=rng.randint(0, 59), microsecond=0,
            ).isoformat()
            date_str = bill_dt.strftime("%Y%m%d")

            picked = rng.sample(meds, k=min(rng.randint(1, 3), len(meds)))
            lines = []
            subtotal = cgst_total = sgst_total = taxable_total = total_discount = 0.0
            ok = True

            for med in picked:
                bid = demo_batch_id[med["id"]]
                qty = rng.randint(1, 4)
                if demo_remaining.get(bid, 0) < qty:
                    ok = False
                    break
                disc_pct = float(rng.choice(discount_pool))
                gst_rate = float(med.get("gst_rate", 12.0))
                mrp = float(med["mrp"])
                gross = qty * mrp
                disc = gross * (disc_pct / 100.0)
                taxable = gross - disc
                taxable_ex = round(taxable / (1 + gst_rate / 100.0), 2)
                gst_amt = round(taxable - taxable_ex, 2)
                cgst = round(gst_amt / 2.0, 2)
                sgst = round(gst_amt - cgst, 2)

                lines.append({
                    "medicine_id": med["id"],
                    "medicine_name": med["name"],
                    "strength": med.get("strength", ""),
                    "hsn": med.get("hsn", "3004"),
                    "batch_id": bid,
                    "batch_no": demo_batch_no[med["id"]],
                    "expiry": "2027-12-31",
                    "quantity": qty,
                    "mrp": mrp,
                    "discount_pct": disc_pct,
                    "gst_rate": gst_rate,
                    "taxable_amount": taxable_ex,
                    "cgst": cgst,
                    "sgst": sgst,
                    "line_total": round(taxable, 2),
                })
                demo_remaining[bid] -= qty
                subtotal += gross
                total_discount += disc
                taxable_total += taxable_ex
                cgst_total += cgst
                sgst_total += sgst
                stock_ledger_docs.append({
                    "id": str(uuid.uuid4()),
                    "medicine_id": med["id"],
                    "batch_id": bid,
                    "change": -qty,
                    "type": "sale",
                    "actor": "owner@pharma.com",
                    "created_at": bill_ts,
                })

            if not ok or not lines:
                continue

            grand_total = round(taxable_total + cgst_total + sgst_total, 2)
            bill_counter[date_str] = bill_counter.get(date_str, 0) + 1
            bill_no = f"INV-{date_str}-{bill_counter[date_str]:04d}"
            bill_id = str(uuid.uuid4())

            cust = rng.choice(customer_docs) if rng.random() < 0.35 else None
            payment_mode = rng.choice(payment_pool)
            if cust and payment_mode == "credit":
                credit_ledger_docs.append({
                    "id": str(uuid.uuid4()),
                    "customer_id": cust["id"],
                    "bill_id": bill_id,
                    "type": "sale_credit",
                    "amount": grand_total,
                    "notes": f"Bill {bill_no}",
                    "created_at": bill_ts,
                    "created_by": "owner@pharma.com",
                })

            has_sch_h = any(m.get("schedule") in ("H", "H1", "X") for m in picked)
            rx_details = None
            doctor = None
            if has_sch_h and rng.random() < 0.55:
                doctor = rng.choice(doctor_docs)
                rx_details = {
                    "patient_name": cust["name"] if cust else rng.choice(customer_docs)["name"],
                    "patient_age": str(rng.randint(18, 78)),
                    "prescriber": doctor["name"],
                    "rx_date": (bill_dt - timedelta(days=rng.randint(0, 3))).date().isoformat(),
                }

            bill_docs.append({
                "id": bill_id,
                "bill_no": bill_no,
                "customer_name": cust["name"] if cust else "",
                "customer_phone": cust["phone"] if cust else "",
                "customer_id": cust["id"] if cust else None,
                "doctor_id": doctor["id"] if doctor else None,
                "doctor_name": doctor["name"] if doctor else None,
                "lines": lines,
                "subtotal": round(subtotal, 2),
                "total_discount": round(total_discount, 2),
                "taxable_total": round(taxable_total, 2),
                "cgst_total": round(cgst_total, 2),
                "sgst_total": round(sgst_total, 2),
                "grand_total": grand_total,
                "bill_discount_pct": 0.0,
                "payment_mode": payment_mode,
                "status": "active",
                "rx_details": rx_details,
                "rx_photo": None,
                "created_at": bill_ts,
                "created_by": "owner@pharma.com",
            })

    if bill_docs:
        await db.bills.insert_many(bill_docs)

    if stock_ledger_docs:
        await db.stock_ledger.insert_many(stock_ledger_docs)

    # Apply demo batch quantity changes (subtract everything sold)
    for bid, remaining in demo_remaining.items():
        await db.batches.update_one({"id": bid}, {"$set": {"quantity": remaining, "updated_at": now_iso()}})

    # Sync bill sequence counters so new real bills don't duplicate demo bill numbers
    for date_str, count in bill_counter.items():
        await db.counters.update_one(
            {"_id": f"bill_seq_{date_str}"},
            {"$set": {"seq": count}},
            upsert=True,
        )

    # Credit ledger entries + customer outstanding balances
    if credit_ledger_docs:
        await db.credit_ledger.insert_many(credit_ledger_docs)
        for entry in credit_ledger_docs:
            await db.customers.update_one(
                {"id": entry["customer_id"]},
                {"$inc": {"outstanding": entry["amount"]}},
            )

    # 7. EOD closes for the past 7 days
    eod_docs = []
    for d in range(7, 0, -1):
        eod_date = (today_dt - timedelta(days=d)).date().isoformat()
        day_bills = [b for b in bill_docs if b["created_at"][:10] == eod_date]
        if not day_bills:
            continue
        totals: Dict[str, float] = {"cash": 0.0, "upi": 0.0, "card": 0.0, "credit": 0.0}
        for b in day_bills:
            mode = b["payment_mode"]
            totals[mode] = round(totals.get(mode, 0.0) + b["grand_total"], 2)
        total_sales = round(sum(totals.values()), 2)
        variance = rng.uniform(-40.0, 40.0)
        eod_docs.append({
            "id": str(uuid.uuid4()),
            "date": eod_date,
            "cash_expected": totals["cash"],
            "cash_actual": round(totals["cash"] + variance, 2),
            "upi_total": totals["upi"],
            "card_total": totals["card"],
            "credit_total": totals["credit"],
            "total_sales": total_sales,
            "bill_count": len(day_bills),
            "notes": "",
            "closed_by": "owner@pharma.com",
            "created_at": (today_dt - timedelta(days=d)).replace(hour=21, minute=30, second=0, microsecond=0).isoformat(),
        })
    if eod_docs:
        await db.eod_closes.insert_many(eod_docs)

    logger.info(
        "Demo: rich seed complete — %d bills | %d purchases | %d customers | %d eod closes",
        len(bill_docs), len(purchase_docs), len(customer_docs), len(eod_docs),
    )


async def seed():
    seed_demo = os.getenv("SEED_DEMO_DATA", "false").lower() == "true"

    # Owner + Staff accounts are always seeded — required for first login.
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

    if not seed_demo:
        return

    # Shop (demo only — set SEED_DEMO_DATA=true to populate)
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

    if seed_demo:
        await seed_rich_demo()


async def _run_daily_alerts():
    """Send low-stock and expiry push alerts. Called at startup and daily at 08:30."""
    try:
        meds = await db.medicines.find({}, {"_id": 0}).to_list(2000)
        stock_map = await bulk_stock([m["id"] for m in meds])
        low = [m for m in meds if stock_map.get(m["id"], 0) <= float(m.get("reorder_level", 10))]
        if low:
            names = ", ".join(m["name"] for m in low[:3])
            suffix = f" +{len(low)-3} more" if len(low) > 3 else ""
            await send_push_to_owners("Low Stock Alert 🔴", f"{names}{suffix} below reorder level")

        limit_30 = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
        today_s = datetime.now(timezone.utc).date().isoformat()
        exp_batches = await db.batches.find(
            {"expiry": {"$lte": limit_30, "$gte": today_s}, "quantity": {"$gt": 0}}, {"_id": 0}
        ).to_list(500)
        if exp_batches:
            med_ids = list({b["medicine_id"] for b in exp_batches})
            exp_meds = await db.medicines.find({"id": {"$in": med_ids}}, {"_id": 0, "name": 1}).to_list(500)
            names2 = ", ".join(m["name"] for m in exp_meds[:3])
            suffix2 = f" +{len(exp_meds)-3} more" if len(exp_meds) > 3 else ""
            await send_push_to_owners("Expiry Alert 🟡", f"{names2}{suffix2} expiring within 30 days")
    except Exception as e:
        logger.warning("Daily alert task failed: %s", e)


async def _daily_alert_loop():
    """Sleep until 08:30 local time, then run alerts every 24 h."""
    while True:
        now_dt = datetime.now(timezone.utc)
        next_run = now_dt.replace(hour=8, minute=30, second=0, microsecond=0)
        if next_run <= now_dt:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now_dt).total_seconds())
        await _run_daily_alerts()


@app.on_event("startup")
async def on_startup():
    await seed()
    # Indexes for sync delta queries and frequent lookups.
    await db.medicines.create_index("updated_at")
    await db.medicines.create_index("id", unique=True, sparse=True)
    await db.batches.create_index("updated_at")
    await db.batches.create_index([("medicine_id", 1), ("expiry", 1)])
    await db.bills.create_index("id", unique=True, sparse=True)
    await db.bills.create_index("created_at")
    await db.stock_ledger.create_index([("medicine_id", 1), ("batch_id", 1)])
    # Compound indexes for common query patterns
    await db.bills.create_index([("shop_id", 1), ("created_at", -1)])
    await db.purchases.create_index([("shop_id", 1), ("status", 1)])
    # Start daily alert background loop
    asyncio.ensure_future(_daily_alert_loop())


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ================================================================
# PUSH NOTIFICATION HELPER
# ================================================================

import threading

def _sync_send_expo_push(token: str, title: str, body: str):
    import requests as _req
    try:
        _req.post(
            "https://exp.host/--/api/v2/push/send",
            json={"to": token, "title": title, "body": body, "sound": "default"},
            timeout=8,
        )
    except Exception:
        pass


async def send_push_to_owners(title: str, body: str):
    owners = await db.users.find(
        {"role": "owner", "push_token": {"$exists": True, "$ne": None}},
        {"_id": 0, "push_token": 1},
    ).to_list(20)
    loop = asyncio.get_event_loop()
    for o in owners:
        token = o.get("push_token")
        if token:
            loop.run_in_executor(None, _sync_send_expo_push, token, title, body)


async def _check_low_stock_push(med_ids: list):
    try:
        low_items = await low_stock()
        flagged = [i for i in low_items if i.get("id") in med_ids]
        if flagged:
            names = ", ".join(i["name"] for i in flagged[:3])
            suffix = f" (+{len(flagged)-3} more)" if len(flagged) > 3 else ""
            await send_push_to_owners("Low Stock Alert", f"{names}{suffix} below reorder level")
    except Exception:
        pass


# ------------------------ Auth Routes ------------------------ #
@api.get("/health")
async def health():
    return {"status": "ok", "time": now_iso()}


_TOTP_PENDING: Dict[str, dict] = {}  # temp_token → {email, role, expires}

@api.post("/auth/login", response_model=LoginResp)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    ip = request.client.host if request.client else "unknown"
    _check_login_rate(ip)
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        _record_login_failure(ip)
        raise HTTPException(400, "Incorrect email or password")
    _clear_login_failures(ip)
    shop_id = user.get("default_shop_id", "default")
    if user.get("totp_enabled") and user.get("totp_secret") and _PYOTP_OK:
        temp = secrets.token_urlsafe(32)
        _TOTP_PENDING[temp] = {
            "email": user["email"], "role": user["role"], "shop_id": shop_id,
            "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        return LoginResp(access_token="", totp_required=True, temp_token=temp,
                         role=user["role"], email=user["email"])
    token = create_access_token(user["email"], user["role"], shop_id)
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


@api.put("/auth/staff/{staff_id}", response_model=UserOut)
async def update_staff(staff_id: str, payload: StaffUpdate, owner: dict = Depends(require_owner)):
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] == "owner":
        raise HTTPException(400, "Cannot edit this user")
    updates: dict = {}
    if payload.name and payload.name.strip():
        updates["name"] = payload.name.strip()
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        updates["hashed_password"] = hash_password(payload.password)
    if not updates:
        raise HTTPException(400, "Nothing to update")
    await db.users.update_one({"id": staff_id}, {"$set": updates})
    await write_audit(owner["email"], "update_staff", "user", staff_id, {"fields": list(updates.keys())})
    updated = await db.users.find_one({"id": staff_id}, {"_id": 0, "hashed_password": 0})
    return UserOut(**updated)


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
    if "mode" in updates and updates["mode"] not in STORE_CONFIGS:
        raise HTTPException(400, f"Unknown store type: {updates['mode']}. Valid: {list(STORE_CONFIGS)}")
    await db.shop.update_one({}, {"$set": updates})
    await write_audit(owner["email"], "update_shop", "shop", "shop", updates)
    s = await db.shop.find_one({}, {"_id": 0})
    return Shop(**s)


@api.get("/store-config")
async def get_store_config(_: dict = Depends(get_current_user)):
    s = await db.shop.find_one({}, {"_id": 0, "mode": 1})
    mode = (s or {}).get("mode", "pharmacy")
    cfg = STORE_CONFIGS.get(mode, _DEFAULT_STORE_CONFIG)
    return {"store_type": mode, **cfg}


@api.get("/store-config/all")
async def get_all_store_configs(_: dict = Depends(require_owner)):
    return {k: {"store_type": k, **v} for k, v in STORE_CONFIGS.items()}


# ------------------------ Medicines ------------------------ #
async def medicine_with_stock(m: dict) -> dict:
    total = 0
    async for b in db.batches.find({"medicine_id": m["id"]}, {"_id": 0, "quantity": 1}):
        total += float(b.get("quantity", 0))
    return {**m, "total_stock": total}


async def bulk_stock(med_ids: List[str]) -> Dict[str, float]:
    """One aggregation round-trip to sum batch quantity per medicine."""
    pipeline = [
        {"$match": {"medicine_id": {"$in": med_ids}}},
        {"$group": {"_id": "$medicine_id", "total": {"$sum": "$quantity"}}},
    ]
    stock: Dict[str, float] = {}
    async for doc in db.batches.aggregate(pipeline):
        stock[doc["_id"]] = float(doc["total"])
    return stock


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
    stock_map = await bulk_stock([m["id"] for m in items])
    result = [{**m, "total_stock": stock_map.get(m["id"], 0)} for m in items]
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
    doc["updated_at"] = doc["created_at"]
    await db.medicines.insert_one(doc)
    await write_audit(user["email"], "create_medicine", "medicine", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return MedicineOut(**{**doc, "total_stock": 0})


@api.put("/medicines/{med_id}", response_model=MedicineOut)
async def update_medicine(med_id: str, payload: MedicineIn, user: dict = Depends(get_current_user)):
    old = await db.medicines.find_one({"id": med_id}, {"_id": 0, "mrp": 1})
    updates = payload.dict()
    updates["updated_at"] = now_iso()
    result = await db.medicines.update_one({"id": med_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Medicine not found")
    # Log MRP change to price_history
    if old and float(old.get("mrp", 0)) != float(payload.mrp):
        await db.price_history.insert_one({
            "id": str(uuid.uuid4()),
            "medicine_id": med_id,
            "old_mrp": float(old.get("mrp", 0)),
            "new_mrp": float(payload.mrp),
            "changed_by": user["email"],
            "changed_at": updates["updated_at"],
        })
    await write_audit(user["email"], "update_medicine", "medicine", med_id, updates)
    m = await db.medicines.find_one({"id": med_id}, {"_id": 0})
    m = await medicine_with_stock(m)
    return MedicineOut(**m)


@api.get("/medicines/{med_id}/price-history")
async def medicine_price_history(med_id: str, _: dict = Depends(get_current_user)):
    rows = await db.price_history.find(
        {"medicine_id": med_id}, {"_id": 0}
    ).sort("changed_at", -1).to_list(50)
    return rows


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
        d["updated_at"] = d["created_at"]
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


@api.get("/batches/{medicine_id}")
async def list_batches_by_med(medicine_id: str, _: dict = Depends(get_current_user)):
    """Path-based alias for barcode label screen."""
    batches = await db.batches.find({"medicine_id": medicine_id, "quantity": {"$gt": 0}}, {"_id": 0}).to_list(200)
    batches.sort(key=lambda b: b["expiry"])
    return batches


@api.get("/batches/by-supplier/{supplier_id}")
async def list_batches_by_supplier(supplier_id: str, _: dict = Depends(get_current_user)):
    """All batches linked to a supplier (for supplier-return screen)."""
    pipeline = [
        {"$match": {"supplier_id": supplier_id, "quantity": {"$gt": 0}}},
        {"$lookup": {"from": "medicines", "localField": "medicine_id", "foreignField": "id", "as": "med"}},
        {"$project": {
            "_id": 0, "id": 1, "medicine_id": 1, "batch_no": 1, "expiry": 1,
            "quantity": 1, "mrp": 1, "purchase_price": 1,
            "medicine_name": {"$arrayElemAt": ["$med.name", 0]},
        }},
    ]
    return await db.batches.aggregate(pipeline).to_list(500)


@api.post("/batches", response_model=BatchOut)
async def create_batch(payload: BatchIn, user: dict = Depends(get_current_user)):
    med = await db.medicines.find_one({"id": payload.medicine_id})
    if not med:
        raise HTTPException(404, "Medicine not found")
    doc = payload.dict()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    doc["updated_at"] = doc["created_at"]
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
async def _next_seq(key: str) -> int:
    """Atomically increment and return a named sequence counter."""
    result = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return int(result["seq"])


async def _generate_bill_no() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    seq = await _next_seq(f"bill_seq_{today}")
    shop = await db.shop.find_one({}, {"_id": 0, "invoice_prefix": 1})
    prefix = (shop or {}).get("invoice_prefix") or "INV"
    return f"{prefix}-{today}-{seq:04d}"


@api.post("/bills", response_model=BillOut)
async def create_bill(payload: BillCreate, user: dict = Depends(get_current_user)):
    if not payload.lines:
        raise HTTPException(400, "Bill has no lines")

    # Idempotency: if the client sent a client_id and a bill already exists for it,
    # return that bill without touching stock.
    if payload.client_id:
        existing = await db.bills.find_one({"id": payload.client_id}, {"_id": 0})
        if existing:
            return BillOut(**existing)

    med_ids = list({l.medicine_id for l in payload.lines})
    meds = await db.medicines.find({"id": {"$in": med_ids}}, {"_id": 0}).to_list(1000)
    med_map = {m["id"]: m for m in meds}
    missing = [mid for mid in med_ids if mid not in med_map]
    if missing:
        raise HTTPException(400, f"Unknown medicines: {missing}")

    picked_lines: List[dict] = []
    batch_updates: List[tuple] = []
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
        gst_rate = float(med.get("gst_rate", 12.0))

        if line.batch_id:
            # Client pre-picked a batch (offline FEFO) — use it directly.
            b = await db.batches.find_one({"id": line.batch_id}, {"_id": 0})
            if not b:
                raise HTTPException(400, f"Batch {line.batch_id} not found")
            if float(b["quantity"]) < line.quantity:
                raise HTTPException(
                    400,
                    f"Batch {b['batch_no']} only has {b['quantity']} units (requested {line.quantity})"
                )
            candidates = [b]
            remaining = line.quantity
        else:
            # Server-side FEFO pick.
            candidates = await db.batches.find(
                {"medicine_id": line.medicine_id, "quantity": {"$gt": 0}},
                {"_id": 0},
            ).to_list(500)
            candidates.sort(key=lambda b: b["expiry"])
            remaining = line.quantity

        for b in candidates:
            if remaining <= 0:
                break
            take = min(remaining, float(b["quantity"]))
            if take <= 0:
                continue
            gross = take * float(b["mrp"])
            disc = gross * (line.discount_pct / 100.0)
            taxable = gross - disc
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
            batch_updates.append((b["id"], take))
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

    bill_disc_amt = round(taxable_total * (payload.bill_discount_pct / 100.0), 2)
    taxable_total = round(taxable_total - bill_disc_amt, 2)
    total_discount = round(total_discount + bill_disc_amt, 2)
    grand_total = round(taxable_total + cgst_total + sgst_total, 2)

    # Validate and apply loyalty points redemption (1 point = ₹1 off grand_total)
    loyalty_discount = 0.0
    if payload.loyalty_points_used > 0 and payload.customer_id:
        cust_doc = await db.customers.find_one({"id": payload.customer_id})
        available_pts = int(cust_doc.get("loyalty_points", 0)) if cust_doc else 0
        redeemable = min(payload.loyalty_points_used, available_pts, int(grand_total))
        if redeemable > 0:
            loyalty_discount = float(redeemable)
            grand_total = round(grand_total - loyalty_discount, 2)

    bill_no = await _generate_bill_no()
    # Use client-provided UUID so the local record and server record share the same id.
    bill_id = payload.client_id or str(uuid.uuid4())
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
        "loyalty_discount": loyalty_discount,
        "loyalty_points_used": int(loyalty_discount),
        "payment_mode": payload.payment_mode,
        "split_payment": payload.split_payment or None,
        "status": "active",
        "created_at": now_iso(),
        "created_by": user["email"],
        "sold_by_id": user.get("id", ""),
        "sold_by_name": user.get("name", ""),
        "rx_details": payload.rx_details or None,
        "rx_photo": payload.rx_photo or None,
        "customer_id": payload.customer_id or None,
        "doctor_id": payload.doctor_id or None,
        "doctor_name": payload.doctor_name or None,
        "edit_count": 0,
        "shop_id": user.get("_shop_id", "default"),
    }
    # Atomically decrement stock *before* inserting the bill.
    # find_one_and_update with quantity >= take is a single atomic op — no TOCTOU window.
    # On concurrent depletion (returns None), roll back already-applied decrements and abort.
    _ts = now_iso()
    applied_decrements: List[tuple] = []
    for bid, take in batch_updates:
        res = await db.batches.find_one_and_update(
            {"id": bid, "quantity": {"$gte": take}},
            {"$inc": {"quantity": -take}, "$set": {"updated_at": _ts}},
        )
        if res is None:
            for rbid, rbtake in applied_decrements:
                await db.batches.update_one({"id": rbid}, {"$inc": {"quantity": rbtake}})
            raise HTTPException(409, "Stock depleted by a concurrent transaction — please retry")
        applied_decrements.append((bid, take))

    await db.bills.insert_one(bill_doc)

    for ld in ledger_docs:
        ld["reference"] = bill_id
    if ledger_docs:
        await db.stock_ledger.insert_many(ledger_docs)
    # Auto-create credit ledger entry when payment_mode == "credit" and customer linked
    if payload.payment_mode == "credit" and payload.customer_id:
        _now = now_iso()
        credit_entry = {
            "id": str(uuid.uuid4()),
            "customer_id": payload.customer_id,
            "bill_id": bill_id,
            "type": "sale_credit",
            "amount": grand_total,
            "notes": f"Bill {bill_no}",
            "created_at": _now,
            "created_by": user["email"],
        }
        await db.credit_ledger.insert_one(credit_entry)
        await db.customers.update_one(
            {"id": payload.customer_id},
            {"$inc": {"outstanding": grand_total}, "$set": {"updated_at": _now}},
        )

    # Loyalty: deduct redeemed points, then earn new points (1 per ₹100 of grand_total)
    if payload.customer_id:
        points_earned = int(grand_total / 100)
        pts_delta = points_earned - int(loyalty_discount)
        if pts_delta != 0 or loyalty_discount > 0:
            await db.customers.update_one(
                {"id": payload.customer_id},
                {"$inc": {"loyalty_points": pts_delta}, "$set": {"updated_at": now_iso()}},
            )

    # Fire-and-forget: push notification if any medicine dropped below reorder
    asyncio.ensure_future(_check_low_stock_push(med_ids))

    await write_audit(user["email"], "create_bill", "bill", bill_id, {"bill_no": bill_no, "grand_total": grand_total})

    bill_doc.pop("_id", None)
    return BillOut(**bill_doc)


@api.get("/bills", response_model=List[BillOut])
async def list_bills(
    limit: int = 200,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD start date"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD end date"),
    customer_q: Optional[str] = Query(None, description="Search by customer name or phone"),
    invoice_no: Optional[str] = Query(None, description="Bill number search"),
    payment_mode: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    user: dict = Depends(get_current_user),
):
    query: dict = _shop_q(user.get("_shop_id", "default"))
    date_range: dict = {}
    if date_from:
        date_range["$gte"] = date_from + "T00:00:00"
    if date_to:
        date_range["$lte"] = date_to + "T23:59:59"
    if date_range:
        query["created_at"] = date_range
    if customer_q:
        query["$or"] = [
            {"customer_name": {"$regex": customer_q, "$options": "i"}},
            {"customer_phone": {"$regex": customer_q, "$options": "i"}},
        ]
    if invoice_no:
        query["bill_no"] = {"$regex": invoice_no, "$options": "i"}
    if payment_mode:
        query["payment_mode"] = payment_mode
    if status_filter:
        query["status"] = status_filter
    bills = await db.bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [BillOut(**b) for b in bills]


@api.get("/bills/{bill_id}/versions")
async def get_bill_versions(bill_id: str, _: dict = Depends(get_current_user)):
    versions = await db.bill_versions.find({"bill_id": bill_id}, {"_id": 0}).sort("version", -1).to_list(50)
    return versions


@api.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: str, _: dict = Depends(get_current_user)):
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Bill not found")
    return BillOut(**b)


@api.put("/bills/{bill_id}", response_model=BillOut)
async def edit_bill(bill_id: str, payload: BillEditIn, user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(404, "Bill not found")
    if bill.get("status") == "cancelled":
        raise HTTPException(400, "Cannot edit a cancelled bill")
    if not payload.reason.strip():
        raise HTTPException(400, "Edit reason is required")
    # Staff need owner to approve the edit first; owners can always edit.
    if user.get("role") != "owner":
        approved_until = _BILL_EDIT_APPROVED.get(bill_id)
        if not approved_until or datetime.now(timezone.utc) > approved_until:
            raise HTTPException(
                403,
                "Bill is locked. Ask the owner to approve this edit (POST /bills/{id}/approve-edit)."
            )
        # Consume the approval so it can't be reused
        _BILL_EDIT_APPROVED.pop(bill_id, None)

    # Index existing lines by (medicine_id, batch_id)
    old_line_index: Dict[tuple, dict] = {}
    for ln in bill["lines"]:
        key = (ln["medicine_id"], ln["batch_id"])
        old_line_index[key] = ln

    # Validate all edited lines reference existing (medicine_id, batch_id) pairs
    for el in payload.lines:
        if el.quantity < 0:
            raise HTTPException(400, f"Quantity cannot be negative for batch {el.batch_id}")
        key = (el.medicine_id, el.batch_id)
        if key not in old_line_index:
            raise HTTPException(400, f"Line (medicine {el.medicine_id}, batch {el.batch_id}) not in original bill")

    # Snapshot old bill to bill_versions before modifying
    version_num = bill.get("edit_count", 0) + 1
    await db.bill_versions.insert_one({
        "id": str(uuid.uuid4()),
        "bill_id": bill_id,
        "version": version_num,
        "snapshot": {k: v for k, v in bill.items() if k != "_id"},
        "edited_at": now_iso(),
        "edited_by": user["email"],
        "edited_by_name": user.get("name", ""),
        "reason": payload.reason,
    })

    # Adjust stock for each line delta
    _ts = now_iso()
    new_lines = []
    subtotal = 0.0
    total_discount = 0.0
    taxable_total = 0.0
    cgst_total = 0.0
    sgst_total = 0.0

    for el in payload.lines:
        key = (el.medicine_id, el.batch_id)
        old_ln = old_line_index[key]
        delta = el.quantity - int(old_ln["quantity"])

        if delta > 0:
            # Increasing qty — deduct more stock from the batch
            res = await db.batches.find_one_and_update(
                {"id": el.batch_id, "quantity": {"$gte": delta}},
                {"$inc": {"quantity": -delta}, "$set": {"updated_at": _ts}},
            )
            if res is None:
                raise HTTPException(409, f"Insufficient stock to increase quantity for batch {el.batch_id}")
            await db.stock_ledger.insert_one({
                "id": str(uuid.uuid4()),
                "medicine_id": el.medicine_id,
                "batch_id": el.batch_id,
                "change": -delta,
                "type": "bill_edit",
                "reference": bill_id,
                "actor": user["email"],
                "created_at": _ts,
            })
        elif delta < 0:
            # Decreasing qty — restore stock to batch
            restore = abs(delta)
            await db.batches.update_one(
                {"id": el.batch_id},
                {"$inc": {"quantity": restore}, "$set": {"updated_at": _ts}},
            )
            await db.stock_ledger.insert_one({
                "id": str(uuid.uuid4()),
                "medicine_id": el.medicine_id,
                "batch_id": el.batch_id,
                "change": restore,
                "type": "bill_edit_restore",
                "reference": bill_id,
                "actor": user["email"],
                "created_at": _ts,
            })

        # Recalculate line financials with new quantity
        new_qty = el.quantity
        mrp = float(old_ln["mrp"])
        disc = float(old_ln["discount_pct"])
        gst_rate = float(old_ln["gst_rate"])
        gross = round(new_qty * mrp * (1 - disc / 100), 2)
        disc_amt = round(new_qty * mrp - gross, 2)
        gst_divisor = 1 + gst_rate / 100
        taxable_ex = round(gross / gst_divisor, 2)
        tax = round(gross - taxable_ex, 2)
        cgst = sgst = round(tax / 2, 2)
        line_total = gross

        new_lines.append({**old_ln, "quantity": new_qty, "taxable_amount": taxable_ex, "cgst": cgst, "sgst": sgst, "line_total": line_total})
        subtotal += new_qty * mrp
        total_discount += disc_amt
        taxable_total += taxable_ex
        cgst_total += cgst
        sgst_total += sgst

    bill_disc_pct = float(bill.get("bill_discount_pct", 0))
    bill_disc_amt = round(taxable_total * (bill_disc_pct / 100), 2)
    taxable_total = round(taxable_total - bill_disc_amt, 2)
    total_discount = round(total_discount + bill_disc_amt, 2)
    grand_total = round(taxable_total + cgst_total + sgst_total, 2)

    updates = {
        "lines": new_lines,
        "subtotal": round(subtotal, 2),
        "total_discount": total_discount,
        "taxable_total": taxable_total,
        "cgst_total": round(cgst_total, 2),
        "sgst_total": round(sgst_total, 2),
        "grand_total": grand_total,
        "edited_at": _ts,
        "edit_reason": payload.reason,
        "edit_count": version_num,
    }
    if payload.payment_mode:
        updates["payment_mode"] = payload.payment_mode

    await db.bills.update_one({"id": bill_id}, {"$set": updates})
    await write_audit(user["email"], "edit_bill", "bill", bill_id, {
        "bill_no": bill["bill_no"], "reason": payload.reason, "version": version_num,
    })

    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return BillOut(**b)


# In-memory store: bill_id → expiry datetime of edit permission
_BILL_EDIT_APPROVED: Dict[str, datetime] = {}

@api.post("/bills/{bill_id}/approve-edit")
async def approve_bill_edit(bill_id: str, owner: dict = Depends(require_owner)):
    """Owner grants a 10-minute edit window for a specific bill."""
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0, "id": 1})
    if not b:
        raise HTTPException(404, "Bill not found")
    expiry = datetime.now(timezone.utc) + timedelta(minutes=10)
    _BILL_EDIT_APPROVED[bill_id] = expiry
    await write_audit(owner["email"], "approve_bill_edit", "bill", bill_id, {})
    return {"approved_until": expiry.isoformat()}


@api.post("/admin/run-alerts")
async def trigger_alerts(owner: dict = Depends(require_owner)):
    """Manually trigger the daily low-stock and expiry push notifications."""
    asyncio.ensure_future(_run_daily_alerts())
    return {"status": "queued"}


@api.post("/bills/{bill_id}/cancel", response_model=BillOut)
async def cancel_bill(bill_id: str, user: dict = Depends(get_current_user)):
    b = await db.bills.find_one({"id": bill_id})
    if not b:
        raise HTTPException(404, "Bill not found")
    if b.get("status") == "cancelled":
        raise HTTPException(400, "Bill already cancelled")

    # Subtract already-returned quantities so we don't double-restore stock.
    existing_returns = await db.returns.find({"bill_id": bill_id}, {"_id": 0}).to_list(500)
    returned_qty: Dict[tuple, int] = {}
    for ret in existing_returns:
        for rl in ret.get("lines", []):
            key = (rl["medicine_id"], rl["batch_id"])
            returned_qty[key] = returned_qty.get(key, 0) + int(rl["quantity"])

    for ln in b["lines"]:
        key = (ln["medicine_id"], ln["batch_id"])
        already_returned = returned_qty.get(key, 0)
        restore_qty = int(ln["quantity"]) - already_returned
        if restore_qty <= 0:
            continue  # all units already returned; stock is already back
        await db.batches.update_one(
            {"id": ln["batch_id"]},
            {"$inc": {"quantity": restore_qty}, "$set": {"updated_at": now_iso()}},
        )
        await db.stock_ledger.insert_one({
            "id": str(uuid.uuid4()),
            "medicine_id": ln["medicine_id"],
            "batch_id": ln["batch_id"],
            "change": restore_qty,
            "type": "cancel",
            "reference": bill_id,
            "actor": user["email"],
            "created_at": now_iso(),
        })

    await db.bills.update_one({"id": bill_id}, {"$set": {"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by": user["email"]}})
    await write_audit(user["email"], "cancel_bill", "bill", bill_id, {"bill_no": b["bill_no"]})
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return BillOut(**b)


# ------------------------ Partial Returns ------------------------ #
@api.post("/bills/{bill_id}/return", response_model=ReturnOut)
async def partial_return(bill_id: str, payload: ReturnCreate, user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id})
    if not bill:
        raise HTTPException(404, "Bill not found")
    if bill.get("status") == "cancelled":
        raise HTTPException(400, "Cannot return items from a cancelled bill")

    # Index billed lines by (medicine_id, batch_id) for validation.
    billed_index: Dict[tuple, dict] = {}
    for ln in bill["lines"]:
        key = (ln["medicine_id"], ln["batch_id"])
        billed_index[key] = ln

    # Check already-returned quantities for this bill so we don't over-return.
    existing_returns = await db.returns.find({"bill_id": bill_id}, {"_id": 0}).to_list(500)
    returned_qty: Dict[tuple, int] = {}
    for r in existing_returns:
        for rl in r.get("lines", []):
            key = (rl["medicine_id"], rl["batch_id"])
            returned_qty[key] = returned_qty.get(key, 0) + int(rl["quantity"])

    return_lines_out = []
    total_refund = 0.0

    for rl in payload.lines:
        if rl.quantity <= 0:
            raise HTTPException(400, "Return quantity must be > 0")
        key = (rl.medicine_id, rl.batch_id)
        billed = billed_index.get(key)
        if not billed:
            raise HTTPException(400, f"Line (medicine {rl.medicine_id}, batch {rl.batch_id}) not found in this bill")
        already = returned_qty.get(key, 0)
        billed_qty = int(billed["quantity"])
        if already + rl.quantity > billed_qty:
            raise HTTPException(
                400,
                f"{billed['medicine_name']}: can only return {billed_qty - already} more unit(s) "
                f"({billed_qty} billed, {already} already returned)"
            )

        # Refund amount proportional to billed line total.
        unit_price = round(float(billed["line_total"]) / billed_qty, 4)
        refund_amt = round(unit_price * rl.quantity, 2)
        total_refund += refund_amt

        return_lines_out.append({
            "medicine_id": rl.medicine_id,
            "medicine_name": billed["medicine_name"],
            "batch_id": rl.batch_id,
            "batch_no": billed["batch_no"],
            "quantity": rl.quantity,
            "mrp": float(billed["mrp"]),
            "refund_amount": refund_amt,
        })

        # Restore stock in the batch.
        await db.batches.update_one(
            {"id": rl.batch_id},
            {"$inc": {"quantity": rl.quantity}, "$set": {"updated_at": now_iso()}},
        )

        # Stock ledger entry.
        await db.stock_ledger.insert_one({
            "id": str(uuid.uuid4()),
            "medicine_id": rl.medicine_id,
            "batch_id": rl.batch_id,
            "change": rl.quantity,
            "type": "return",
            "reference": bill_id,
            "actor": user["email"],
            "created_at": now_iso(),
        })

    return_id = str(uuid.uuid4())
    return_doc = {
        "id": return_id,
        "bill_id": bill_id,
        "bill_no": bill["bill_no"],
        "lines": return_lines_out,
        "total_refund": round(total_refund, 2),
        "reason": payload.reason or "",
        "created_at": now_iso(),
        "created_by": user["email"],
    }
    await db.returns.insert_one(return_doc)
    await write_audit(user["email"], "partial_return", "bill", bill_id, {
        "return_id": return_id, "lines": len(return_lines_out), "refund": total_refund,
    })
    return_doc.pop("_id", None)
    return ReturnOut(**return_doc)


@api.get("/bills/{bill_id}/returns", response_model=List[ReturnOut])
async def list_returns(bill_id: str, _: dict = Depends(get_current_user)):
    docs = await db.returns.find({"bill_id": bill_id}, {"_id": 0}).to_list(500)
    return [ReturnOut(**d) for d in docs]


# ------------------------ Reports ------------------------ #
@api.get("/reports/low-stock")
async def low_stock(_: dict = Depends(get_current_user)):
    meds = await db.medicines.find({}, {"_id": 0}).to_list(2000)
    stock_map = await bulk_stock([m["id"] for m in meds])
    out = []
    for m in meds:
        m = {**m, "total_stock": stock_map.get(m["id"], 0)}
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


@api.get("/reports/gst-summary")
async def gst_summary(month: str = "", _: dict = Depends(get_current_user)):
    """
    month = YYYY-MM (defaults to current month).
    Returns per-HSN aggregates suitable for GSTR-1 filing.
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    # Bills whose created_at starts with this month prefix.
    bills = await db.bills.find(
        {"created_at": {"$regex": f"^{month}"}, "status": "active"},
        {"_id": 0},
    ).to_list(5000)

    # Group by HSN code. Single pass: accumulate amounts + track bill IDs per HSN.
    hsn_map: Dict[str, dict] = defaultdict(lambda: {
        "hsn": "",
        "taxable_value": 0.0,
        "cgst": 0.0,
        "sgst": 0.0,
        "total_tax": 0.0,
        "bill_ids": set(),
    })

    for bill in bills:
        for line in bill.get("lines", []):
            hsn = str(line.get("hsn", "3004") or "3004")
            # stored field is taxable_amount (not taxable_value)
            taxable = float(line.get("taxable_amount", 0) or 0)
            cgst = float(line.get("cgst", 0) or 0)
            sgst = float(line.get("sgst", 0) or 0)

            rec = hsn_map[hsn]
            rec["hsn"] = hsn
            rec["taxable_value"] = round(rec["taxable_value"] + taxable, 2)
            rec["cgst"] = round(rec["cgst"] + cgst, 2)
            rec["sgst"] = round(rec["sgst"] + sgst, 2)
            rec["total_tax"] = round(rec["total_tax"] + cgst + sgst, 2)
            rec["bill_ids"].add(bill["id"])

    rows = []
    for rec in hsn_map.values():
        invoice_count = len(rec.pop("bill_ids"))
        rec["invoice_count"] = invoice_count
        rows.append(rec)

    rows.sort(key=lambda r: r["hsn"])

    total_taxable = round(sum(r["taxable_value"] for r in rows), 2)
    total_cgst = round(sum(r["cgst"] for r in rows), 2)
    total_sgst = round(sum(r["sgst"] for r in rows), 2)

    return {
        "month": month,
        "bill_count": len(bills),
        "rows": rows,
        "totals": {
            "taxable_value": total_taxable,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "total_tax": round(total_cgst + total_sgst, 2),
        },
    }


@api.get("/reports/gstr1")
async def gstr1_export(month: str = "", _: dict = Depends(get_current_user)):
    """
    GSTR-1 B2CS slab-wise aggregation for the given month (YYYY-MM).
    Returns JSON rows grouped by GST rate — client builds the CSV locally.
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    bills = await db.bills.find(
        {"created_at": {"$regex": f"^{month}"}, "status": "active"},
        {"_id": 0},
    ).to_list(5000)

    slab_map: Dict[float, dict] = {}
    for bill in bills:
        for line in bill.get("lines", []):
            rate = float(line.get("gst_rate", 0) or 0)
            taxable = float(line.get("taxable_amount", 0) or 0)
            cgst = float(line.get("cgst", 0) or 0)
            sgst = float(line.get("sgst", 0) or 0)
            if rate not in slab_map:
                slab_map[rate] = {"gst_rate": rate, "taxable_value": 0.0, "cgst": 0.0, "sgst": 0.0, "total_tax": 0.0}
            s = slab_map[rate]
            s["taxable_value"] = round(s["taxable_value"] + taxable, 2)
            s["cgst"] = round(s["cgst"] + cgst, 2)
            s["sgst"] = round(s["sgst"] + sgst, 2)
            s["total_tax"] = round(s["total_tax"] + cgst + sgst, 2)

    return sorted(slab_map.values(), key=lambda r: r["gst_rate"])


@api.get("/reports/schedule-h")
async def schedule_h_report(month: str = "", _: dict = Depends(get_current_user)):
    """
    Returns all bills in the given month that have rx_details set.
    Used for the Schedule H / H1 drug sale register (Drug & Cosmetics Act).
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    bills = await db.bills.find(
        {
            "created_at": {"$regex": f"^{month}"},
            "status": "active",
            "rx_details": {"$exists": True, "$ne": None},
        },
        {"_id": 0},
    ).to_list(5000)

    rows = []
    for bill in bills:
        rx = bill.get("rx_details") or {}
        # Collect Schedule H medicines from this bill
        sch_h_lines = [
            {
                "medicine_name": ln.get("medicine_name", ""),
                "batch_no": ln.get("batch_no", ""),
                "quantity": ln.get("quantity", 0),
            }
            for ln in bill.get("lines", [])
        ]
        rows.append({
            "bill_no": bill.get("bill_no", ""),
            "bill_date": (bill.get("created_at") or "")[:10],
            "patient_name": rx.get("patient_name", ""),
            "patient_age": rx.get("patient_age", ""),
            "patient_addr": rx.get("patient_addr", ""),
            "prescriber": rx.get("prescriber", ""),
            "rx_date": rx.get("rx_date", ""),
            "medicines": sch_h_lines,
        })

    return {"month": month, "count": len(rows), "records": rows}


@api.get("/stats/today")
async def stats_today(_: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    last_week = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    last_week_end = (datetime.now(timezone.utc) - timedelta(days=6)).date().isoformat()
    bills, purchases, credit_bills, low, exp30, wow_bills = await asyncio.gather(
        db.bills.find(
            {"created_at": {"$gte": today}, "status": "active"},
            {"_id": 0, "grand_total": 1, "payment_mode": 1},
        ).to_list(2000),
        db.purchases.find(
            {"created_at": {"$gte": today}},
            {"_id": 0, "total_amount": 1},
        ).to_list(2000),
        db.bills.find(
            {"payment_mode": "credit", "status": "active"},
            {"_id": 0, "grand_total": 1},
        ).to_list(5000),
        low_stock(),
        expiring(window=30),
        db.bills.find(
            {"created_at": {"$gte": last_week, "$lt": last_week_end}, "status": "active"},
            {"_id": 0, "grand_total": 1},
        ).to_list(2000),
    )
    total_sales = round(sum(b.get("grand_total", 0) for b in bills), 2)
    bill_count = len(bills)
    purchase_total = round(sum(p.get("total_amount", 0) for p in purchases), 2)
    profit_today = round(total_sales - purchase_total, 2)
    pending_credit_count = len(credit_bills)
    pending_credit_amount = round(sum(b.get("grand_total", 0) for b in credit_bills), 2)
    wow_sales = round(sum(b.get("grand_total", 0) for b in wow_bills), 2)
    wow_pct = round(((total_sales - wow_sales) / wow_sales * 100) if wow_sales > 0 else 0.0, 1)
    return {
        "sales_total": total_sales,
        "bill_count": bill_count,
        "profit_today": profit_today,
        "purchase_total": purchase_total,
        "pending_credit_count": pending_credit_count,
        "pending_credit_amount": pending_credit_amount,
        "low_stock_count": len(low),
        "expiring_30_count": len(exp30),
        "wow_sales": wow_sales,
        "wow_pct": wow_pct,
    }


@api.get("/stats/staff-sales")
async def staff_sales(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _: dict = Depends(require_owner),
):
    today = datetime.now(timezone.utc).date().isoformat()
    q: dict = {"status": "active"}
    if date_from:
        q["created_at"] = {"$gte": date_from}
    if date_to:
        q.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"

    bills = await db.bills.find(q, {"_id": 0, "grand_total": 1, "created_by": 1, "created_at": 1}).to_list(50000)

    # Aggregate per staff email
    agg: dict = {}
    for b in bills:
        key = b.get("created_by") or "unknown"
        if key not in agg:
            agg[key] = {"email": key, "bill_count": 0, "total_sales": 0.0}
        agg[key]["bill_count"] += 1
        agg[key]["total_sales"] += b.get("grand_total", 0)

    # Enrich with names from users collection
    users = await db.users.find({}, {"_id": 0, "email": 1, "name": 1, "role": 1}).to_list(1000)
    name_map = {u["email"]: u["name"] for u in users}
    role_map = {u["email"]: u["role"] for u in users}

    result = []
    for email, row in agg.items():
        result.append({
            "email": email,
            "name": name_map.get(email, email),
            "role": role_map.get(email, "staff"),
            "bill_count": row["bill_count"],
            "total_sales": round(row["total_sales"], 2),
            "avg_bill": round(row["total_sales"] / row["bill_count"], 2) if row["bill_count"] else 0,
        })

    result.sort(key=lambda x: x["total_sales"], reverse=True)
    return result


# ------------------------ Audit ------------------------ #
@api.get("/audit")
async def audit_list(limit: int = 200, _: dict = Depends(require_owner)):
    events = await db.audit_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return events


# ------------------------ Sync Pull ------------------------ #

@api.get("/sync/changes")
async def sync_changes(since: Optional[str] = None, _: dict = Depends(get_current_user)):
    """
    Returns medicines and batches modified after `since` (ISO timestamp).
    The client stores the returned `pulled_at` as its pull cursor.
    If `since` is omitted, returns everything (initial sync).
    """
    pulled_at = now_iso()
    query: dict = {}
    if since:
        query = {"updated_at": {"$gt": since}}

    SYNC_PAGE = 20_000  # well above any realistic single-pharmacy catalog
    medicines = await db.medicines.find(query, {"_id": 0}).to_list(SYNC_PAGE + 1)
    batches = await db.batches.find(query, {"_id": 0}).to_list(SYNC_PAGE + 1)

    med_has_more = len(medicines) > SYNC_PAGE
    bat_has_more = len(batches) > SYNC_PAGE

    return {
        "medicines": medicines[:SYNC_PAGE],
        "batches": batches[:SYNC_PAGE],
        "pulled_at": pulled_at,
        "has_more": med_has_more or bat_has_more,
    }


# ================================================================
# CUSTOMERS
# ================================================================

class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    credit_limit: float = 0.0


@api.get("/customers")
async def list_customers(q: str = "", _: dict = Depends(get_current_user)):
    query: dict = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]}
    customers = await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return customers


@api.get("/customers/{cid}")
async def get_customer(
    cid: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    bill_q: dict = {"customer_id": cid, "status": "active"}
    if date_from:
        bill_q.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        bill_q.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"
    bills = await db.bills.find(
        bill_q,
        {"_id": 0, "id": 1, "bill_no": 1, "grand_total": 1, "payment_mode": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(200)
    c["recent_bills"] = bills
    ledger = await db.credit_ledger.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    c["ledger"] = ledger
    return c


@api.post("/customers")
async def create_customer(payload: CustomerIn, _: dict = Depends(get_current_user)):
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "name": payload.name,
        "phone": payload.phone or "",
        "address": payload.address or "",
        "credit_limit": payload.credit_limit,
        "outstanding": 0.0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/customers/{cid}")
async def update_customer(cid: str, payload: CustomerIn, _: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Customer not found")
    await db.customers.update_one({"id": cid}, {"$set": {
        "name": payload.name,
        "phone": payload.phone or "",
        "address": payload.address or "",
        "credit_limit": payload.credit_limit,
        "updated_at": now_iso(),
    }})
    return await db.customers.find_one({"id": cid}, {"_id": 0})


# ----------------------------------------------------------------
# Credit Ledger
# ----------------------------------------------------------------

class CreditEntryIn(BaseModel):
    type: str  # "sale_credit" | "payment" | "adjustment"
    amount: float
    bill_id: Optional[str] = None
    notes: Optional[str] = ""


@api.get("/customers/{cid}/ledger")
async def get_ledger(cid: str, _: dict = Depends(get_current_user)):
    entries = await db.credit_ledger.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return entries


@api.post("/customers/{cid}/ledger")
async def add_ledger_entry(cid: str, payload: CreditEntryIn, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Customer not found")
    if payload.type not in ("sale_credit", "payment", "adjustment"):
        raise HTTPException(400, "type must be sale_credit, payment, or adjustment")
    entry = {
        "id": str(uuid.uuid4()),
        "customer_id": cid,
        "bill_id": payload.bill_id,
        "type": payload.type,
        "amount": payload.amount,
        "notes": payload.notes or "",
        "created_at": now_iso(),
        "created_by": user["email"],
    }
    await db.credit_ledger.insert_one(entry)
    # update outstanding: sale_credit and adjustment add; payment subtracts
    delta = payload.amount if payload.type in ("sale_credit", "adjustment") else -payload.amount
    new_outstanding = round((c.get("outstanding") or 0) + delta, 2)
    await db.customers.update_one({"id": cid}, {"$set": {"outstanding": new_outstanding, "updated_at": now_iso()}})
    entry.pop("_id", None)
    return entry


@api.get("/customers/{cid}/loyalty")
async def get_loyalty(cid: str, _: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0, "loyalty_points": 1})
    if not c:
        raise HTTPException(404, "Customer not found")
    return {"loyalty_points": int(c.get("loyalty_points", 0))}


# ================================================================
# SUPPLIERS
# ================================================================

class SupplierIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    gstin: Optional[str] = ""
    dl_no: Optional[str] = ""
    credit_limit: float = 0.0


@api.get("/suppliers")
async def list_suppliers(q: str = "", _: dict = Depends(get_current_user)):
    query: dict = {}
    if q:
        query = {"name": {"$regex": q, "$options": "i"}}
    return await db.suppliers.find(query, {"_id": 0}).sort("name", 1).to_list(200)


@api.post("/suppliers")
async def create_supplier(payload: SupplierIn, _: dict = Depends(get_current_user)):
    sid = str(uuid.uuid4())
    doc = {"id": sid, **payload.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.suppliers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, payload: SupplierIn, _: dict = Depends(get_current_user)):
    s = await db.suppliers.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Supplier not found")
    await db.suppliers.update_one({"id": sid}, {"$set": {**payload.model_dump(), "updated_at": now_iso()}})
    return await db.suppliers.find_one({"id": sid}, {"_id": 0})


@api.get("/suppliers/{sid}")
async def get_supplier(sid: str, _: dict = Depends(get_current_user)):
    s = await db.suppliers.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Supplier not found")
    purchases, payments = await asyncio.gather(
        db.purchases.find({"supplier_id": sid}, {"_id": 0, "id": 1, "invoice_no": 1, "invoice_date": 1, "total_amount": 1, "paid_amount": 1, "payment_mode": 1, "created_at": 1}).sort("created_at", -1).to_list(200),
        db.supplier_payments.find({"supplier_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200),
    )
    total_purchases = round(sum(p.get("total_amount", 0) for p in purchases), 2)
    total_paid = round(sum(p.get("paid_amount", 0) for p in purchases), 2) + round(sum(p.get("amount", 0) for p in payments), 2)
    s["purchases"] = purchases
    s["payments"] = payments
    s["total_purchases"] = total_purchases
    s["total_paid"] = total_paid
    s["outstanding"] = round(total_purchases - total_paid, 2)
    return s


@api.post("/suppliers/{sid}/payments")
async def record_supplier_payment(sid: str, payload: dict, user: dict = Depends(get_current_user)):
    amount = float(payload.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    doc = {
        "id": str(uuid.uuid4()),
        "supplier_id": sid,
        "amount": amount,
        "notes": payload.get("notes", ""),
        "payment_mode": payload.get("payment_mode", "cash"),
        "created_at": now_iso(),
        "created_by": user["email"],
    }
    await db.supplier_payments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, _: dict = Depends(require_owner)):
    await db.suppliers.delete_one({"id": sid})
    return {"deleted": True}


# ================================================================
# PURCHASES
# ================================================================

class PurchaseLineIn(BaseModel):
    medicine_id: str
    medicine_name: str
    batch_no: str
    expiry: str
    quantity: int
    purchase_price: float
    mrp: float
    gst_rate: float = 0.0


class PurchaseIn(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = ""
    invoice_no: Optional[str] = ""
    invoice_date: Optional[str] = None
    payment_mode: str = "cash"
    paid_amount: float = 0.0
    invoice_doc_url: Optional[str] = None
    lines: List[PurchaseLineIn]


@api.get("/purchases")
async def list_purchases(limit: int = 100, user: dict = Depends(get_current_user)):
    return await db.purchases.find(_shop_q(user.get("_shop_id", "default")), {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.get("/purchases/{pid}")
async def get_purchase(pid: str, _: dict = Depends(get_current_user)):
    p = await db.purchases.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Purchase not found")
    lines = await db.purchase_lines.find({"purchase_id": pid}, {"_id": 0}).to_list(500)
    p["lines"] = lines
    return p


@api.post("/purchases")
async def create_purchase(payload: PurchaseIn, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    now = now_iso()
    total = round(sum(l.quantity * l.purchase_price for l in payload.lines), 2)

    # Resolve supplier name
    supplier_name = payload.supplier_name or ""
    if payload.supplier_id and not supplier_name:
        s = await db.suppliers.find_one({"id": payload.supplier_id})
        supplier_name = s["name"] if s else ""

    purchase_doc = {
        "id": pid,
        "supplier_id": payload.supplier_id,
        "supplier_name": supplier_name,
        "invoice_no": payload.invoice_no or "",
        "invoice_date": payload.invoice_date or now[:10],
        "total_amount": total,
        "paid_amount": payload.paid_amount,
        "payment_mode": payload.payment_mode,
        "status": "received",
        "invoice_doc_url": payload.invoice_doc_url or None,
        "created_at": now,
        "created_by": user["email"],
        "shop_id": user.get("_shop_id", "default"),
    }
    await db.purchases.insert_one(purchase_doc)

    for line in payload.lines:
        # Create or update batch
        bid = str(uuid.uuid4())
        existing = await db.batches.find_one(
            {"medicine_id": line.medicine_id, "batch_no": line.batch_no, "expiry": line.expiry}
        )
        if existing:
            new_qty = existing["quantity"] + line.quantity
            await db.batches.update_one(
                {"id": existing["id"]},
                {"$set": {"quantity": new_qty, "purchase_price": line.purchase_price, "mrp": line.mrp, "updated_at": now}}
            )
            bid = existing["id"]
        else:
            batch_doc = {
                "id": bid,
                "medicine_id": line.medicine_id,
                "batch_no": line.batch_no,
                "expiry": line.expiry,
                "quantity": line.quantity,
                "purchase_price": line.purchase_price,
                "mrp": line.mrp,
                "supplier_id": payload.supplier_id,
                "created_at": now,
                "updated_at": now,
                "deleted": 0,
            }
            await db.batches.insert_one(batch_doc)

        pl_doc = {
            "id": str(uuid.uuid4()),
            "purchase_id": pid,
            "medicine_id": line.medicine_id,
            "medicine_name": line.medicine_name,
            "batch_id": bid,
            "batch_no": line.batch_no,
            "expiry": line.expiry,
            "quantity": line.quantity,
            "purchase_price": line.purchase_price,
            "mrp": line.mrp,
            "gst_rate": line.gst_rate,
        }
        await db.purchase_lines.insert_one(pl_doc)

        # Stock ledger
        await db.stock_ledger.insert_one({
            "id": str(uuid.uuid4()),
            "medicine_id": line.medicine_id,
            "batch_id": bid,
            "change": line.quantity,
            "type": "purchase",
            "reference": pid,
            "actor": user["email"],
            "created_at": now,
        })

    # Auto-record supplier price catalog entries
    if payload.supplier_id:
        for line in payload.lines:
            await db.supplier_prices.update_one(
                {"supplier_id": payload.supplier_id, "medicine_id": line.medicine_id},
                {"$set": {
                    "supplier_id": payload.supplier_id,
                    "medicine_id": line.medicine_id,
                    "medicine_name": line.medicine_name,
                    "purchase_price": line.purchase_price,
                    "mrp": line.mrp,
                    "last_updated": now,
                }},
                upsert=True,
            )

    await write_audit(user["email"], "create_purchase", "purchase", pid, {"invoice_no": payload.invoice_no, "total": total})
    return await get_purchase(pid, user)


@api.get("/suppliers/{sid}/prices")
async def get_supplier_prices(sid: str, _: dict = Depends(get_current_user)):
    rows = await db.supplier_prices.find({"supplier_id": sid}, {"_id": 0}).to_list(500)
    return rows


@api.post("/suppliers/{sid}/prices")
async def upsert_supplier_price(sid: str, payload: dict, _: dict = Depends(get_current_user)):
    now = now_iso()
    await db.supplier_prices.update_one(
        {"supplier_id": sid, "medicine_id": payload["medicine_id"]},
        {"$set": {
            "supplier_id": sid,
            "medicine_id": payload["medicine_id"],
            "medicine_name": payload.get("medicine_name", ""),
            "purchase_price": float(payload["purchase_price"]),
            "mrp": float(payload.get("mrp", 0)),
            "last_updated": now,
        }},
        upsert=True,
    )
    return {"ok": True}


@api.put("/purchases/{pid}/status")
async def update_purchase_status(pid: str, payload: dict, _: dict = Depends(get_current_user)):
    status = payload.get("status", "")
    if status not in ("pending", "received", "cancelled"):
        raise HTTPException(400, "status must be pending, received, or cancelled")
    result = await db.purchases.update_one(
        {"id": pid}, {"$set": {"status": status, "updated_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Purchase not found")
    return {"ok": True, "status": status}


@api.get("/batches/expiring-soon")
async def batches_expiring_soon(days: int = 90, _: dict = Depends(get_current_user)):
    cutoff = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m")
    today = datetime.utcnow().strftime("%Y-%m")
    batches = await db.batches.find(
        {"expiry": {"$lte": cutoff, "$gte": today}, "quantity": {"$gt": 0}, "deleted": {"$ne": 1}},
        {"_id": 0}
    ).sort("expiry", 1).to_list(500)
    # Enrich with medicine name
    med_ids = list({b["medicine_id"] for b in batches})
    meds = await db.medicines.find({"id": {"$in": med_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    med_map = {m["id"]: m["name"] for m in meds}
    for b in batches:
        b["medicine_name"] = med_map.get(b["medicine_id"], "")
    return batches


# ================================================================
# STOCK ADJUSTMENTS / WRITE-OFFS
# ================================================================

class AdjustmentIn(BaseModel):
    medicine_id: str
    medicine_name: str
    batch_id: str
    batch_no: str
    change: int           # negative = write-off, positive = correction
    reason: str           # "expiry_writeoff" | "damage" | "theft" | "correction" | "other"
    notes: Optional[str] = ""


@api.get("/adjustments")
async def list_adjustments(limit: int = 200, _: dict = Depends(get_current_user)):
    return await db.stock_adjustments.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.post("/adjustments")
async def create_adjustment(payload: AdjustmentIn, user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"id": payload.batch_id})
    if not batch:
        raise HTTPException(404, "Batch not found")
    new_qty = batch["quantity"] + payload.change
    if new_qty < 0:
        raise HTTPException(400, f"Cannot reduce below 0 — current stock is {batch['quantity']}")

    now = now_iso()
    await db.batches.update_one({"id": payload.batch_id}, {"$set": {"quantity": new_qty, "updated_at": now}})

    adj = {
        "id": str(uuid.uuid4()),
        "medicine_id": payload.medicine_id,
        "medicine_name": payload.medicine_name,
        "batch_id": payload.batch_id,
        "batch_no": payload.batch_no,
        "change": payload.change,
        "reason": payload.reason,
        "notes": payload.notes or "",
        "created_at": now,
        "created_by": user["email"],
    }
    await db.stock_adjustments.insert_one(adj)
    await db.stock_ledger.insert_one({
        "id": str(uuid.uuid4()),
        "medicine_id": payload.medicine_id,
        "batch_id": payload.batch_id,
        "change": payload.change,
        "type": payload.reason,
        "reference": adj["id"],
        "actor": user["email"],
        "created_at": now,
    })
    await write_audit(user["email"], "stock_adjustment", "batch", payload.batch_id, {
        "medicine": payload.medicine_name, "change": payload.change, "reason": payload.reason
    })
    adj.pop("_id", None)
    return adj


# ================================================================
# EOD CLOSE
# ================================================================

class EodCloseIn(BaseModel):
    date: str
    cash_actual: float
    notes: Optional[str] = ""


@api.get("/eod")
async def list_eod(_: dict = Depends(get_current_user), limit: int = 90):
    return await db.eod_closes.find({}, {"_id": 0}).sort("date", -1).to_list(limit)


@api.get("/eod/preview")
async def eod_preview(date: str = "", _: dict = Depends(get_current_user)):
    """Compute expected cash and totals for a given date (default today)."""
    if not date:
        date = datetime.now(timezone.utc).date().isoformat()
    bills = await db.bills.find(
        {"created_at": {"$regex": f"^{date}"}, "status": "active"},
        {"_id": 0, "payment_mode": 1, "grand_total": 1}
    ).to_list(5000)

    totals: Dict[str, float] = {"cash": 0.0, "upi": 0.0, "card": 0.0, "credit": 0.0}
    for b in bills:
        mode = b.get("payment_mode", "cash")
        totals[mode] = round(totals.get(mode, 0.0) + b.get("grand_total", 0.0), 2)

    return {
        "date": date,
        "bill_count": len(bills),
        "total_sales": round(sum(totals.values()), 2),
        "cash_expected": totals["cash"],
        "upi_total": totals["upi"],
        "card_total": totals["card"],
        "credit_total": totals["credit"],
    }


@api.post("/eod")
async def close_eod(payload: EodCloseIn, user: dict = Depends(get_current_user)):
    existing = await db.eod_closes.find_one({"date": payload.date})
    if existing:
        raise HTTPException(400, f"EOD already closed for {payload.date}")

    preview = await eod_preview(payload.date, user)
    doc = {
        "id": str(uuid.uuid4()),
        "date": payload.date,
        "cash_expected": preview["cash_expected"],
        "cash_actual": payload.cash_actual,
        "upi_total": preview["upi_total"],
        "card_total": preview["card_total"],
        "credit_total": preview["credit_total"],
        "total_sales": preview["total_sales"],
        "bill_count": preview["bill_count"],
        "notes": payload.notes or "",
        "closed_by": user["email"],
        "created_at": now_iso(),
    }
    await db.eod_closes.insert_one(doc)
    doc.pop("_id", None)
    await write_audit(user["email"], "eod_close", "eod", doc["id"], {"date": payload.date, "total_sales": preview["total_sales"]})
    return doc


# ================================================================
# PASSWORD CHANGE
# ================================================================

class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class VerifyPasswordIn(BaseModel):
    password: str


@api.post("/auth/verify-password")
async def verify_password_endpoint(payload: VerifyPasswordIn, user: dict = Depends(get_current_user)):
    db_user = await db.users.find_one({"email": user["email"]})
    if not db_user or not verify_password(payload.password, db_user["hashed_password"]):
        raise HTTPException(401, "Incorrect password")
    return {"verified": True}


@api.post("/auth/change-password")
async def change_password(payload: PasswordChangeIn, user: dict = Depends(get_current_user)):
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    db_user = await db.users.find_one({"email": user["email"]})
    if not db_user or not verify_password(payload.current_password, db_user["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect")
    new_hash = hash_password(payload.new_password)
    await db.users.update_one({"email": user["email"]}, {"$set": {"hashed_password": new_hash}})
    await write_audit(user["email"], "change_password", "user", db_user["id"], {})
    return {"success": True}


# ================================================================
# DOCTORS
# ================================================================

class DoctorIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    clinic: Optional[str] = ""
    speciality: Optional[str] = ""
    address: Optional[str] = ""


@api.get("/doctors")
async def list_doctors(q: str = "", _: dict = Depends(get_current_user)):
    filt: dict = {}
    if q:
        filt = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"clinic": {"$regex": q, "$options": "i"}}]}
    return await db.doctors.find(filt, {"_id": 0}).sort("name", 1).to_list(500)


@api.post("/doctors")
async def create_doctor(payload: DoctorIn, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **payload.dict(), "created_at": now_iso(), "created_by": user["email"], "updated_at": now_iso()}
    await db.doctors.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/doctors/{did}")
async def update_doctor(did: str, payload: DoctorIn, _: dict = Depends(get_current_user)):
    await db.doctors.update_one({"id": did}, {"$set": {**payload.dict(), "updated_at": now_iso()}})
    return {"success": True}


@api.delete("/doctors/{did}")
async def delete_doctor(did: str, _: dict = Depends(get_current_user)):
    await db.doctors.delete_one({"id": did})
    return {"success": True}


# ================================================================
# SUPPLIER RETURNS
# ================================================================

class SupplierReturnLineIn(BaseModel):
    medicine_id: str
    medicine_name: str
    batch_id: str
    batch_no: str
    quantity: int
    purchase_price: float
    reason: str


class SupplierReturnIn(BaseModel):
    supplier_id: str
    supplier_name: str
    return_date: str
    lines: List[SupplierReturnLineIn]
    notes: Optional[str] = ""


@api.get("/supplier-returns")
async def list_supplier_returns(_: dict = Depends(get_current_user), limit: int = 60):
    return await db.supplier_returns.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.post("/supplier-returns")
async def create_supplier_return(payload: SupplierReturnIn, user: dict = Depends(get_current_user)):
    return_id = str(uuid.uuid4())
    ym = datetime.now(timezone.utc).strftime("%Y%m")
    seq = await _next_seq(f"sr_seq_{ym}")
    debit_note_no = f"SR-{ym}-{seq:04d}"

    total_amount = 0.0
    ledger_docs = []
    _now = now_iso()

    for line in payload.lines:
        # Add back stock atomically — $inc avoids a read-modify-write race.
        await db.batches.update_one(
            {"id": line.batch_id},
            {"$inc": {"quantity": line.quantity}, "$set": {"updated_at": _now}},
        )
        line_amount = round(line.quantity * line.purchase_price, 2)
        total_amount += line_amount
        ledger_docs.append({
            "id": str(uuid.uuid4()),
            "medicine_id": line.medicine_id,
            "batch_id": line.batch_id,
            "change": line.quantity,
            "type": "supplier_return",
            "reference": return_id,
            "reason": line.reason,
            "actor": user["email"],
            "created_at": _now,
        })

    doc = {
        "id": return_id,
        "debit_note_no": debit_note_no,
        "supplier_id": payload.supplier_id,
        "supplier_name": payload.supplier_name,
        "return_date": payload.return_date,
        "lines": [l.dict() for l in payload.lines],
        "total_amount": round(total_amount, 2),
        "notes": payload.notes or "",
        "status": "submitted",
        "created_by": user["email"],
        "created_at": _now,
    }
    await db.supplier_returns.insert_one(doc)
    if ledger_docs:
        await db.stock_ledger.insert_many(ledger_docs)
    doc.pop("_id", None)
    await write_audit(user["email"], "supplier_return", "supplier_return", return_id, {"debit_note_no": debit_note_no, "total": total_amount})
    return doc


# ================================================================
# ANALYTICS
# ================================================================

@api.get("/analytics/sales")
async def sales_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}, "status": "active"}},
        {"$facet": {
            "summary": [
                {"$group": {"_id": None, "bill_count": {"$sum": 1}, "total_revenue": {"$sum": "$grand_total"}}},
            ],
            "by_mode": [
                {"$group": {"_id": "$payment_mode", "total": {"$sum": "$grand_total"}}},
            ],
            "hourly": [
                {"$project": {"h": {"$toInt": {"$substr": ["$created_at", 11, 2]}}}},
                {"$group": {"_id": "$h", "bills": {"$sum": 1}}},
            ],
            "med_stats": [
                {"$unwind": "$lines"},
                {"$group": {
                    "_id": "$lines.medicine_id",
                    "name": {"$first": "$lines.medicine_name"},
                    "qty": {"$sum": "$lines.quantity"},
                    "revenue": {"$sum": "$lines.line_total"},
                }},
            ],
        }},
    ]
    docs = await db.bills.aggregate(pipeline).to_list(1)
    facets = docs[0] if docs else {}

    summary = (facets.get("summary") or [{}])[0]
    bill_count = int(summary.get("bill_count", 0))
    total_revenue = round(float(summary.get("total_revenue", 0)), 2)

    med_stats = [
        {"id": str(d["_id"]), "name": d.get("name", "Unknown"),
         "qty": int(d.get("qty", 0)), "revenue": round(float(d.get("revenue", 0)), 2)}
        for d in facets.get("med_stats", [])
    ]
    sorted_by_qty = sorted(med_stats, key=lambda x: x["qty"], reverse=True)
    sorted_by_rev = sorted(med_stats, key=lambda x: x["revenue"], reverse=True)

    hourly_map = {int(d["_id"]): int(d["bills"]) for d in facets.get("hourly", []) if d["_id"] is not None}
    hourly = [hourly_map.get(i, 0) for i in range(24)]
    peak_hour = hourly.index(max(hourly)) if any(h > 0 for h in hourly) else None

    return {
        "month": month,
        "bill_count": bill_count,
        "total_revenue": total_revenue,
        "top_by_qty": sorted_by_qty[:20],
        "slow_movers": sorted_by_qty[-10:][::-1] if len(sorted_by_qty) > 10 else [],
        "top_by_revenue": sorted_by_rev[:10],
        "by_payment_mode": [{"mode": d["_id"] or "cash", "total": round(float(d["total"]), 2)}
                            for d in facets.get("by_mode", [])],
        "hourly_distribution": [{"hour": i, "bills": hourly[i]} for i in range(24)],
        "peak_hour": peak_hour,
    }


@api.get("/analytics/staff")
async def staff_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}, "status": "active"}},
        {"$group": {
            "_id": "$created_by",
            "bill_count": {"$sum": 1},
            "revenue": {"$sum": "$grand_total"},
            "discount_given": {"$sum": "$total_discount"},
        }},
        {"$sort": {"revenue": -1}},
    ]
    rows = await db.bills.aggregate(pipeline).to_list(500)
    staff = [
        {
            "email": d["_id"] or "unknown",
            "bill_count": int(d.get("bill_count", 0)),
            "revenue": round(float(d.get("revenue", 0)), 2),
            "discount_given": round(float(d.get("discount_given", 0)), 2),
        }
        for d in rows
    ]

    return {
        "month": month,
        "staff": staff,
        "total_bills": sum(s["bill_count"] for s in staff),
    }


@api.get("/analytics/cashflow")
async def cashflow_analytics(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),  # "cash" | "bank" | None (all)
    _: dict = Depends(require_owner),
):
    df = date_from or (datetime.now(timezone.utc) - timedelta(days=29)).date().isoformat()
    dt = date_to or datetime.now(timezone.utc).date().isoformat()

    # Resolve which payment modes to include
    if mode == "cash":
        bill_modes = ["cash"]
        purchase_modes = ["cash"]
    elif mode == "bank":
        bill_modes = ["upi", "card", "neft"]
        purchase_modes = ["upi", "card", "neft"]
    else:
        bill_modes = ["cash", "upi", "card"]
        purchase_modes = ["cash", "upi", "neft", "card"]

    # Build a dict keyed by date string YYYY-MM-DD
    days: dict = {}
    cur = datetime.fromisoformat(df).date()
    end = datetime.fromisoformat(dt).date()
    while cur <= end:
        days[cur.isoformat()] = {"date": cur.isoformat(), "cash_in": 0.0, "cash_out": 0.0}
        cur += timedelta(days=1)

    # Cash-in: paid sales filtered by mode
    bills = await db.bills.find(
        {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"}, "status": "active",
         "payment_mode": {"$in": bill_modes}},
        {"_id": 0, "grand_total": 1, "created_at": 1},
    ).to_list(50000)
    for b in bills:
        d = b["created_at"][:10]
        if d in days:
            days[d]["cash_in"] = round(days[d]["cash_in"] + float(b.get("grand_total", 0)), 2)

    # Cash-in: customer credit payments received
    coll = await db.credit_ledger.find(
        {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"}, "type": "payment"},
        {"_id": 0, "amount": 1, "created_at": 1},
    ).to_list(50000)
    for c in coll:
        d = c["created_at"][:10]
        if d in days:
            days[d]["cash_in"] = round(days[d]["cash_in"] + float(c.get("amount", 0)), 2)

    # Cash-out: purchases filtered by mode
    purchases = await db.purchases.find(
        {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"},
         "payment_mode": {"$in": purchase_modes}},
        {"_id": 0, "paid_amount": 1, "created_at": 1},
    ).to_list(50000)
    for p in purchases:
        d = p["created_at"][:10]
        if d in days:
            days[d]["cash_out"] = round(days[d]["cash_out"] + float(p.get("paid_amount", 0)), 2)

    # Cash-out: expenses
    expenses = await db.expenses.find(
        {"date": {"$gte": df, "$lte": dt}},
        {"_id": 0, "amount": 1, "date": 1},
    ).to_list(50000)
    for e in expenses:
        d = e["date"]
        if d in days:
            days[d]["cash_out"] = round(days[d]["cash_out"] + float(e.get("amount", 0)), 2)

    # Cash-out: supplier payments
    sp = await db.supplier_payments.find(
        {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"}},
        {"_id": 0, "amount": 1, "created_at": 1},
    ).to_list(50000)
    for s in sp:
        d = s["created_at"][:10]
        if d in days:
            days[d]["cash_out"] = round(days[d]["cash_out"] + float(s.get("amount", 0)), 2)

    result = sorted(days.values(), key=lambda x: x["date"])
    for row in result:
        row["net"] = round(row["cash_in"] - row["cash_out"], 2)

    total_in = round(sum(r["cash_in"] for r in result), 2)
    total_out = round(sum(r["cash_out"] for r in result), 2)
    return {"days": result, "total_in": total_in, "total_out": total_out, "net": round(total_in - total_out, 2)}


@api.get("/analytics/pnl")
async def pnl_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    bill_pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}, "status": "active"}},
        {"$group": {
            "_id": None,
            "revenue": {"$sum": "$grand_total"},
            "total_discount": {"$sum": "$total_discount"},
            "bill_count": {"$sum": 1},
        }},
    ]
    purchase_pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}}},
        {"$group": {"_id": None, "cogs": {"$sum": "$total_amount"}, "purchase_count": {"$sum": 1}}},
    ]

    expense_pipeline = [
        {"$match": {"date": {"$regex": f"^{month}"}}},
        {"$group": {"_id": None, "total_expenses": {"$sum": "$amount"}}},
    ]
    expense_category_pipeline = [
        {"$match": {"date": {"$regex": f"^{month}"}}},
        {"$group": {"_id": "$category", "amount": {"$sum": "$amount"}}},
        {"$sort": {"amount": -1}},
    ]

    bill_docs, purchase_docs, expense_docs, expense_cat_docs = await asyncio.gather(
        db.bills.aggregate(bill_pipeline).to_list(1),
        db.purchases.aggregate(purchase_pipeline).to_list(1),
        db.expenses.aggregate(expense_pipeline).to_list(1),
        db.expenses.aggregate(expense_category_pipeline).to_list(100),
    )

    b = (bill_docs or [{}])[0]
    p = (purchase_docs or [{}])[0]
    e = (expense_docs or [{}])[0]

    revenue = round(float(b.get("revenue", 0)), 2)
    total_discount = round(float(b.get("total_discount", 0)), 2)
    bill_count = int(b.get("bill_count", 0))
    cogs = round(float(p.get("cogs", 0)), 2)
    purchase_count = int(p.get("purchase_count", 0))
    total_expenses = round(float(e.get("total_expenses", 0)), 2)

    gross_profit = round(revenue - cogs, 2)
    net_profit = round(gross_profit - total_expenses, 2)
    margin_pct = round((gross_profit / revenue * 100) if revenue > 0 else 0.0, 1)

    expenses_by_category = [
        {"category": doc["_id"] or "other", "amount": round(float(doc["amount"]), 2)}
        for doc in expense_cat_docs
    ]

    return {
        "month": month,
        "revenue": revenue,
        "discounts_given": total_discount,
        "gross_revenue": round(revenue + total_discount, 2),
        "cogs": cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "margin_pct": margin_pct,
        "bill_count": bill_count,
        "purchase_count": purchase_count,
        "expenses_by_category": expenses_by_category,
    }


@api.get("/analytics/doctors")
async def doctor_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}, "status": "active", "doctor_id": {"$ne": None}}},
        {"$group": {
            "_id": "$doctor_id",
            "doctor_name": {"$first": "$doctor_name"},
            "bill_count": {"$sum": 1},
            "revenue": {"$sum": "$grand_total"},
        }},
        {"$sort": {"revenue": -1}},
    ]
    rows = await db.bills.aggregate(pipeline).to_list(100)
    return [
        {
            "doctor_id": r["_id"],
            "doctor_name": r.get("doctor_name") or r["_id"],
            "bill_count": r["bill_count"],
            "revenue": round(float(r["revenue"]), 2),
        }
        for r in rows
    ]


@api.get("/analytics/purchases")
async def purchase_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    by_supplier_pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}}},
        {"$group": {
            "_id": "$supplier_id",
            "supplier_name": {"$first": "$supplier_name"},
            "total_amount": {"$sum": "$total_amount"},
            "paid_amount": {"$sum": "$paid_amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_amount": -1}},
    ]
    top_medicines_pipeline = [
        {"$match": {"purchase_id": {"$regex": "."}}},
        {"$lookup": {"from": "purchases", "localField": "purchase_id", "foreignField": "id", "as": "pur"}},
        {"$unwind": "$pur"},
        {"$match": {"pur.created_at": {"$regex": f"^{month}"}}},
        {"$group": {
            "_id": "$medicine_id",
            "medicine_name": {"$first": "$medicine_name"},
            "total_qty": {"$sum": "$quantity"},
            "total_cost": {"$sum": {"$multiply": ["$quantity", "$purchase_price"]}},
        }},
        {"$sort": {"total_cost": -1}},
        {"$limit": 10},
    ]
    totals_pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "paid": {"$sum": "$paid_amount"}, "count": {"$sum": 1}}},
    ]
    by_supplier, top_meds, totals_docs = await asyncio.gather(
        db.purchases.aggregate(by_supplier_pipeline).to_list(100),
        db.purchase_lines.aggregate(top_medicines_pipeline).to_list(10),
        db.purchases.aggregate(totals_pipeline).to_list(1),
    )
    t = (totals_docs or [{}])[0]
    return {
        "month": month,
        "total_amount": round(float(t.get("total", 0)), 2),
        "total_paid": round(float(t.get("paid", 0)), 2),
        "purchase_count": int(t.get("count", 0)),
        "by_supplier": [
            {"supplier_name": r.get("supplier_name") or "Unknown", "total_amount": round(float(r["total_amount"]), 2),
             "paid_amount": round(float(r["paid_amount"]), 2), "count": r["count"]}
            for r in by_supplier
        ],
        "top_medicines": [
            {"medicine_name": r["medicine_name"], "total_qty": int(r["total_qty"]),
             "total_cost": round(float(r["total_cost"]), 2)}
            for r in top_meds
        ],
    }


@api.get("/analytics/vendors")
async def vendor_analytics(_: dict = Depends(get_current_user)):
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(500)
    purchase_agg = await db.purchases.aggregate([
        {"$group": {
            "_id": "$supplier_id",
            "total_amount": {"$sum": "$total_amount"},
            "paid_amount": {"$sum": "$paid_amount"},
            "count": {"$sum": 1},
            "last_purchase": {"$max": "$created_at"},
        }},
    ]).to_list(500)
    payment_agg = await db.supplier_payments.aggregate([
        {"$group": {"_id": "$supplier_id", "extra_paid": {"$sum": "$amount"}}},
    ]).to_list(500)
    pur_map = {r["_id"]: r for r in purchase_agg}
    pay_map = {r["_id"]: r["extra_paid"] for r in payment_agg}
    result = []
    for s in suppliers:
        sid = s["id"]
        p = pur_map.get(sid, {})
        total = round(float(p.get("total_amount", 0)), 2)
        paid = round(float(p.get("paid_amount", 0)) + float(pay_map.get(sid, 0)), 2)
        result.append({
            "id": sid,
            "name": s["name"],
            "total_purchases": total,
            "total_paid": paid,
            "outstanding": round(total - paid, 2),
            "purchase_count": int(p.get("count", 0)),
            "last_purchase": p.get("last_purchase", "")[:10] if p.get("last_purchase") else None,
        })
    result.sort(key=lambda x: x["total_purchases"], reverse=True)
    return result


@api.get("/analytics/customers")
async def customer_analytics(month: str = "", _: dict = Depends(get_current_user)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    pipeline = [
        {"$match": {"created_at": {"$regex": f"^{month}"}, "status": "active", "customer_id": {"$ne": None}}},
        {"$group": {
            "_id": "$customer_id",
            "customer_name": {"$first": "$customer_name"},
            "customer_phone": {"$first": "$customer_phone"},
            "bill_count": {"$sum": 1},
            "revenue": {"$sum": "$grand_total"},
            "discounts": {"$sum": "$total_discount"},
        }},
        {"$sort": {"revenue": -1}},
        {"$limit": 50},
    ]
    rows = await db.bills.aggregate(pipeline).to_list(50)
    # Fetch loyalty points for each
    cids = [r["_id"] for r in rows]
    customers = await db.customers.find({"id": {"$in": cids}}, {"_id": 0, "id": 1, "loyalty_points": 1}).to_list(50)
    loyalty_map = {c["id"]: c.get("loyalty_points", 0) for c in customers}
    return [
        {
            "customer_id": r["_id"],
            "customer_name": r.get("customer_name") or "Unknown",
            "customer_phone": r.get("customer_phone") or "",
            "bill_count": r["bill_count"],
            "revenue": round(float(r["revenue"]), 2),
            "discounts": round(float(r["discounts"]), 2),
            "loyalty_points": loyalty_map.get(r["_id"], 0),
        }
        for r in rows
    ]


# ================================================================
# REORDER AUTOMATION
# ================================================================

@api.get("/reorder/pending")
async def reorder_pending(_: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {
            "_id": "$medicine_id",
            "medicine_name": {"$first": "$medicine_name"},
            "total_stock": {"$sum": "$quantity"},
            "batches": {"$push": {"batch_no": "$batch_no", "expiry": "$expiry", "quantity": "$quantity"}}
        }},
    ]
    grouped = await db.batches.aggregate(pipeline).to_list(2000)

    med_ids = [b["_id"] for b in grouped]
    med_docs = await db.medicines.find(
        {"id": {"$in": med_ids}},
        {"_id": 0, "id": 1, "reorder_level": 1, "pack": 1, "supplier_id": 1, "supplier_name": 1},
    ).to_list(len(med_ids) + 1)
    med_map = {m["id"]: m for m in med_docs}

    low = []
    for b in grouped:
        med = med_map.get(b["_id"])
        if not med:
            continue
        reorder = med.get("reorder_level", 10)
        if b["total_stock"] <= reorder:
            low.append({
                "medicine_id": b["_id"],
                "medicine_name": b["medicine_name"],
                "pack": med.get("pack", ""),
                "total_stock": b["total_stock"],
                "reorder_level": reorder,
                "shortage": max(0, reorder * 2 - b["total_stock"]),
                "supplier_id": med.get("supplier_id", ""),
                "supplier_name": med.get("supplier_name", ""),
            })

    by_supplier: Dict[str, Dict] = {}
    for item in low:
        sid = item.get("supplier_id") or "unlinked"
        sname = item.get("supplier_name") or "No Supplier Linked"
        if sid not in by_supplier:
            by_supplier[sid] = {"supplier_id": sid, "supplier_name": sname, "items": []}
        by_supplier[sid]["items"].append(item)

    return {"total_items": len(low), "suppliers": list(by_supplier.values())}


@api.post("/reorder/draft-po")
async def draft_purchase_order(user: dict = Depends(get_current_user)):
    pending = await reorder_pending(user)
    created = []
    for sup_group in pending["suppliers"]:
        sid = sup_group["supplier_id"]
        if sid == "unlinked":
            continue
        lines = [
            {
                "medicine_id": it["medicine_id"],
                "medicine_name": it["medicine_name"],
                "suggested_qty": it["shortage"],
                "current_stock": it["total_stock"],
                "reorder_level": it["reorder_level"],
            }
            for it in sup_group["items"]
        ]
        po_doc = {
            "id": str(uuid.uuid4()),
            "supplier_id": sid,
            "supplier_name": sup_group["supplier_name"],
            "status": "draft",
            "lines": lines,
            "created_by": user["email"],
            "created_at": now_iso(),
        }
        await db.purchase_orders.insert_one(po_doc)
        po_doc.pop("_id", None)
        created.append(po_doc)

    return {"created": len(created), "orders": created}


# ================================================================
# PUSH NOTIFICATION TOKENS
# ================================================================

class PushTokenIn(BaseModel):
    token: str
    platform: str = "ios"


@api.get("/push/register")
async def get_push_placeholder():
    return {}


# ─────────────────────── Expenses ────────────────────────────────


EXPENSE_CATEGORIES = ["rent", "salary", "electricity", "supplies", "maintenance", "other"]


class ExpenseIn(BaseModel):
    date: str
    category: str
    amount: float
    notes: Optional[str] = ""


@api.get("/expenses")
async def list_expenses(
    month: Optional[str] = None,
    category: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    q: dict = _shop_q(user.get("_shop_id", "default"))
    if month:
        start = f"{month}-01"
        y, m = month.split("-")
        import calendar as _cal
        last_day = _cal.monthrange(int(y), int(m))[1]
        end = f"{month}-{last_day}"
        q["date"] = {"$gte": start, "$lte": end}
    if category:
        q["category"] = category
    rows = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return rows


@api.post("/expenses")
async def add_expense(payload: ExpenseIn, user: dict = Depends(get_current_user)):
    if payload.category not in EXPENSE_CATEGORIES:
        raise HTTPException(400, f"category must be one of {EXPENSE_CATEGORIES}")
    if payload.amount <= 0:
        raise HTTPException(400, "amount must be positive")
    doc = {
        "id": new_id(),
        "date": payload.date,
        "category": payload.category,
        "amount": payload.amount,
        "notes": payload.notes or "",
        "added_by": user.get("name", user.get("email", "")),
        "created_at": now_iso(),
        "shop_id": user.get("_shop_id", "default"),
    }
    await db.expenses.insert_one(doc)
    return doc


@api.put("/expenses/{expense_id}")
async def update_expense(expense_id: str, payload: ExpenseIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(403, "Only owner can edit expenses")
    if payload.category not in EXPENSE_CATEGORIES:
        raise HTTPException(400, f"category must be one of {EXPENSE_CATEGORIES}")
    result = await db.expenses.update_one(
        {"id": expense_id},
        {"$set": {
            "date": payload.date,
            "category": payload.category,
            "amount": payload.amount,
            "notes": payload.notes,
            "updated_at": now_iso(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Expense not found")
    doc = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    return doc


@api.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(403, "Only owner can delete expenses")
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"success": True}


@api.post("/push/register")
async def register_push(payload: PushTokenIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"email": user["email"]},
        {"$set": {"push_token": payload.token, "push_platform": payload.platform, "push_updated_at": now_iso()}}
    )
    return {"success": True}


# ================================================================
# GENERAL LEDGER
# ================================================================

@api.get("/ledger")
async def general_ledger(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    types: Optional[str] = Query(None),  # comma-separated: sale,purchase,expense,supplier_payment,credit_collection
    limit: int = 500,
    _: dict = Depends(require_owner),
):
    df = date_from or (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    dt = (date_to or datetime.now(timezone.utc).date().isoformat()) + "T23:59:59"
    filter_types = set(types.split(",")) if types else None
    entries = []

    async def _bills():
        if filter_types and "sale" not in filter_types:
            return
        docs = await db.bills.find(
            {"created_at": {"$gte": df, "$lte": dt}, "status": "active"},
            {"_id": 0, "id": 1, "bill_no": 1, "customer_name": 1, "grand_total": 1,
             "payment_mode": 1, "created_at": 1},
        ).to_list(limit)
        for d in docs:
            entries.append({
                "date": d["created_at"],
                "type": "sale",
                "direction": "in",
                "description": f"Sale #{d.get('bill_no','')} — {d.get('customer_name') or 'Walk-in'}",
                "amount": round(float(d.get("grand_total", 0)), 2),
                "ref_id": d["id"],
                "payment_mode": d.get("payment_mode", ""),
            })

    async def _purchases():
        if filter_types and "purchase" not in filter_types:
            return
        docs = await db.purchases.find(
            {"created_at": {"$gte": df, "$lte": dt}},
            {"_id": 0, "id": 1, "supplier_name": 1, "invoice_no": 1,
             "total_amount": 1, "payment_mode": 1, "created_at": 1},
        ).to_list(limit)
        for d in docs:
            entries.append({
                "date": d["created_at"],
                "type": "purchase",
                "direction": "out",
                "description": f"Purchase from {d.get('supplier_name') or 'Unknown'}"
                               + (f" — Inv {d['invoice_no']}" if d.get("invoice_no") else ""),
                "amount": round(float(d.get("total_amount", 0)), 2),
                "ref_id": d["id"],
                "payment_mode": d.get("payment_mode", ""),
            })

    async def _expenses():
        if filter_types and "expense" not in filter_types:
            return
        docs = await db.expenses.find(
            {"date": {"$gte": df[:10], "$lte": dt[:10]}},
            {"_id": 0, "id": 1, "category": 1, "description": 1, "amount": 1, "date": 1},
        ).to_list(limit)
        for d in docs:
            entries.append({
                "date": d["date"] + "T00:00:00",
                "type": "expense",
                "direction": "out",
                "description": f"Expense — {d.get('category','Other')}: {d.get('description','')}",
                "amount": round(float(d.get("amount", 0)), 2),
                "ref_id": d["id"],
                "payment_mode": "",
            })

    async def _supplier_payments():
        if filter_types and "supplier_payment" not in filter_types:
            return
        docs = await db.supplier_payments.find(
            {"created_at": {"$gte": df, "$lte": dt}},
            {"_id": 0, "id": 1, "supplier_id": 1, "amount": 1,
             "notes": 1, "payment_mode": 1, "created_at": 1},
        ).to_list(limit)
        # enrich with supplier name
        supp_ids = list({d["supplier_id"] for d in docs if d.get("supplier_id")})
        supps = {s["id"]: s["name"] for s in await db.suppliers.find(
            {"id": {"$in": supp_ids}}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(200)} if supp_ids else {}
        for d in docs:
            entries.append({
                "date": d["created_at"],
                "type": "supplier_payment",
                "direction": "out",
                "description": f"Supplier payment — {supps.get(d.get('supplier_id',''), 'Unknown')}",
                "amount": round(float(d.get("amount", 0)), 2),
                "ref_id": d["id"],
                "payment_mode": d.get("payment_mode", ""),
            })

    async def _credit_collections():
        if filter_types and "credit_collection" not in filter_types:
            return
        docs = await db.credit_ledger.find(
            {"created_at": {"$gte": df, "$lte": dt}, "type": "payment"},
            {"_id": 0, "id": 1, "customer_id": 1, "amount": 1, "notes": 1, "created_at": 1},
        ).to_list(limit)
        cust_ids = list({d["customer_id"] for d in docs if d.get("customer_id")})
        custs = {c["id"]: c["name"] for c in await db.customers.find(
            {"id": {"$in": cust_ids}}, {"_id": 0, "id": 1, "name": 1}
        ).to_list(200)} if cust_ids else {}
        for d in docs:
            entries.append({
                "date": d["created_at"],
                "type": "credit_collection",
                "direction": "in",
                "description": f"Credit payment from {custs.get(d.get('customer_id',''), 'Customer')}",
                "amount": round(float(d.get("amount", 0)), 2),
                "ref_id": d["id"],
                "payment_mode": "cash",
            })

    await asyncio.gather(_bills(), _purchases(), _expenses(), _supplier_payments(), _credit_collections())
    entries.sort(key=lambda e: e["date"], reverse=True)

    total_in = round(sum(e["amount"] for e in entries if e["direction"] == "in"), 2)
    total_out = round(sum(e["amount"] for e in entries if e["direction"] == "out"), 2)
    return {"entries": entries[:limit], "total_in": total_in, "total_out": total_out, "net": round(total_in - total_out, 2)}


# ================================================================
# SHIFTS
# ================================================================

@api.post("/shifts/clock-in")
async def clock_in(user: dict = Depends(get_current_user)):
    open_shift = await db.shifts.find_one({"user_id": user["id"], "clock_out": None})
    if open_shift:
        raise HTTPException(400, "Already clocked in")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name", user["email"]),
        "clock_in": now_iso(),
        "clock_out": None,
        "duration_minutes": None,
    }
    await db.shifts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/shifts/clock-out")
async def clock_out(user: dict = Depends(get_current_user)):
    open_shift = await db.shifts.find_one({"user_id": user["id"], "clock_out": None})
    if not open_shift:
        raise HTTPException(400, "Not clocked in")
    now = now_iso()
    ci = datetime.fromisoformat(open_shift["clock_in"].replace("Z", "+00:00"))
    co = datetime.fromisoformat(now.replace("Z", "+00:00"))
    minutes = int((co - ci).total_seconds() / 60)
    await db.shifts.update_one(
        {"id": open_shift["id"]},
        {"$set": {"clock_out": now, "duration_minutes": minutes}},
    )
    return {"clock_out": now, "duration_minutes": minutes}


@api.get("/shifts/active")
async def active_shift(user: dict = Depends(get_current_user)):
    shift = await db.shifts.find_one({"user_id": user["id"], "clock_out": None}, {"_id": 0})
    return shift or {}


@api.get("/shifts")
async def list_shifts(
    date: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    limit: int = 200,
    _: dict = Depends(require_owner),
):
    q: dict = {}
    if date:
        q["clock_in"] = {"$gte": date, "$lte": date + "T23:59:59"}
    if user_id:
        q["user_id"] = user_id
    shifts = await db.shifts.find(q, {"_id": 0}).sort("clock_in", -1).to_list(limit)
    return shifts


# ================================================================
# FILE UPLOADS
# ================================================================

_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(_UPLOADS_DIR, exist_ok=True)

_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@api.post("/uploads")
async def upload_file(file: UploadFile = File(...), _: dict = Depends(get_current_user)):
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(400, "Only JPEG, PNG, WebP and PDF are allowed")
    data = await file.read()
    if len(data) > _MAX_SIZE:
        raise HTTPException(413, "File too large (max 10 MB)")
    ext = os.path.splitext(file.filename or "upload")[1] or ".bin"
    fname = f"{uuid.uuid4()}{ext}"
    path = os.path.join(_UPLOADS_DIR, fname)
    with open(path, "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{fname}"}


# ================================================================
# MULTI-STORE MANAGEMENT
# ================================================================

class ShopCreate(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    gstin: str = ""
    dl_no: str = ""
    gst_rate: float = 12.0
    mode: str = "pharmacy"
    invoice_prefix: str = "INV"


@api.get("/shops")
async def list_shops(_: dict = Depends(require_owner)):
    shops = await db.shops.find({}, {"_id": 0}).to_list(100)
    return shops


@api.post("/shops")
async def create_shop(payload: ShopCreate, user: dict = Depends(require_owner)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "address": payload.address,
        "phone": payload.phone,
        "gstin": payload.gstin,
        "dl_no": payload.dl_no,
        "gst_rate": payload.gst_rate,
        "mode": payload.mode,
        "invoice_prefix": payload.invoice_prefix,
        "notification_prefs": None,
        "plan": "starter",
        "plan_expires": None,
        "data_retention_months": 60,
        "created_by": user["email"],
        "created_at": now_iso(),
    }
    await db.shops.insert_one(doc)
    doc.pop("_id", None)
    await write_audit(user["email"], "create_shop", "shop", doc["id"], {"name": payload.name})
    return doc


@api.delete("/shops/{shop_id}")
async def delete_shop(shop_id: str, user: dict = Depends(require_owner)):
    shop = await db.shops.find_one({"id": shop_id})
    if not shop:
        raise HTTPException(404, "Shop not found")
    count = await db.shops.count_documents({})
    if count <= 1:
        raise HTTPException(400, "Cannot delete the last shop")
    await db.shops.delete_one({"id": shop_id})
    await write_audit(user["email"], "delete_shop", "shop", shop_id)
    return {"ok": True}


@api.post("/auth/switch-shop")
async def switch_shop(payload: dict, user: dict = Depends(require_owner)):
    shop_id = payload.get("shop_id")
    if not shop_id:
        raise HTTPException(400, "shop_id required")
    shop = await db.shops.find_one({"id": shop_id})
    if not shop:
        raise HTTPException(404, "Shop not found")
    token = create_access_token(user["email"], user["role"], shop_id)
    await db.users.update_one({"id": user["id"]}, {"$set": {"default_shop_id": shop_id}})
    await write_audit(user["email"], "switch_shop", "shop", shop_id)
    return {"access_token": token, "token_type": "bearer", "shop_id": shop_id, "shop_name": shop["name"]}


# ================================================================
# RAZORPAY SUBSCRIPTION BILLING
# ================================================================

_RZP_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
_RZP_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
_RZP_API = "https://api.razorpay.com/v1"

PLAN_PRICES: dict = {
    ("pro", 1): 99900,   # ₹999 in paise
    ("pro", 6): 499900,  # ₹4999 in paise (6-month)
    ("pro", 12): 899900, # ₹8999 in paise (annual)
}


@api.post("/payments/create-order")
async def create_payment_order(payload: dict, user: dict = Depends(require_owner)):
    if not _RZP_KEY_ID or not _RZP_KEY_SECRET:
        raise HTTPException(503, "Payment gateway not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env")
    plan = payload.get("plan", "pro")
    months = int(payload.get("months", 1))
    amount = PLAN_PRICES.get((plan, months))
    if not amount:
        raise HTTPException(400, f"No price for plan={plan} months={months}")
    receipt_id = f"rcpt_{str(uuid.uuid4())[:8]}"
    resp = requests.post(
        f"{_RZP_API}/orders",
        auth=(_RZP_KEY_ID, _RZP_KEY_SECRET),
        json={"amount": amount, "currency": "INR", "receipt": receipt_id},
        timeout=10,
    )
    if not resp.ok:
        raise HTTPException(502, f"Razorpay error: {resp.text[:200]}")
    order = resp.json()
    await db.payment_orders.insert_one({
        "id": str(uuid.uuid4()),
        "razorpay_order_id": order["id"],
        "plan": plan,
        "months": months,
        "amount": amount,
        "status": "created",
        "created_by": user["email"],
        "created_at": now_iso(),
    })
    return {
        "order_id": order["id"],
        "amount": amount,
        "currency": "INR",
        "key_id": _RZP_KEY_ID,
        "plan": plan,
        "months": months,
    }


@api.post("/payments/verify")
async def verify_payment(payload: dict, user: dict = Depends(require_owner)):
    import hmac
    import hashlib
    if not _RZP_KEY_SECRET:
        raise HTTPException(503, "Payment gateway not configured")
    rzp_order_id = payload.get("razorpay_order_id", "")
    rzp_payment_id = payload.get("razorpay_payment_id", "")
    rzp_signature = payload.get("razorpay_signature", "")
    expected = hmac.new(
        _RZP_KEY_SECRET.encode(), f"{rzp_order_id}|{rzp_payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, rzp_signature):
        raise HTTPException(400, "Payment signature verification failed")
    order_doc = await db.payment_orders.find_one({"razorpay_order_id": rzp_order_id})
    if not order_doc:
        raise HTTPException(404, "Order not found")
    plan = order_doc.get("plan", "pro")
    months = int(order_doc.get("months", 1))
    now_dt = datetime.now(timezone.utc)
    expires = (now_dt + timedelta(days=months * 30)).date().isoformat()
    await db.shops.update_one({}, {"$set": {"plan": plan, "plan_expires": expires}})
    await db.payment_orders.update_one(
        {"razorpay_order_id": rzp_order_id},
        {"$set": {"status": "paid", "razorpay_payment_id": rzp_payment_id, "paid_at": now_iso()}},
    )
    await write_audit(user["email"], "payment_verified", "shop", "shop", {"plan": plan, "months": months})
    return {"ok": True, "plan": plan, "expires": expires}


@api.get("/payments/history")
async def payment_history(user: dict = Depends(require_owner)):
    docs = await db.payment_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return docs


# ================================================================
# TWO-FACTOR AUTH (TOTP)
# ================================================================

class TotpSetupResp(BaseModel):
    secret: str
    otpauth_url: str

class TotpVerifyIn(BaseModel):
    code: str

class TotpChallengeIn(BaseModel):
    temp_token: str
    code: str


@api.post("/auth/2fa/setup", response_model=TotpSetupResp)
async def totp_setup(user: dict = Depends(get_current_user)):
    if not _PYOTP_OK:
        raise HTTPException(503, "2FA not available: pyotp not installed")
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user["email"], issuer_name="Pharma Counter")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_secret": secret, "totp_enabled": False}})
    return TotpSetupResp(secret=secret, otpauth_url=uri)


@api.post("/auth/2fa/enable")
async def totp_enable(payload: TotpVerifyIn, user: dict = Depends(get_current_user)):
    if not _PYOTP_OK:
        raise HTTPException(503, "2FA not available: pyotp not installed")
    fresh = await db.users.find_one({"id": user["id"]})
    secret = fresh.get("totp_secret") if fresh else None
    if not secret:
        raise HTTPException(400, "Run /auth/2fa/setup first")
    totp = pyotp.TOTP(secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_enabled": True}})
    return {"ok": True}


@api.post("/auth/2fa/disable")
async def totp_disable(payload: TotpVerifyIn, user: dict = Depends(get_current_user)):
    if not _PYOTP_OK:
        raise HTTPException(503, "2FA not available: pyotp not installed")
    fresh = await db.users.find_one({"id": user["id"]})
    secret = fresh.get("totp_secret") if fresh else None
    if not secret or not fresh.get("totp_enabled"):
        raise HTTPException(400, "2FA is not enabled")
    totp = pyotp.TOTP(secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$unset": {"totp_secret": "", "totp_enabled": ""}})
    return {"ok": True}


@api.post("/auth/2fa/challenge", response_model=LoginResp)
async def totp_challenge(payload: TotpChallengeIn):
    if not _PYOTP_OK:
        raise HTTPException(503, "2FA not available: pyotp not installed")
    pending = _TOTP_PENDING.get(payload.temp_token)
    if not pending or datetime.now(timezone.utc) > pending["expires"]:
        _TOTP_PENDING.pop(payload.temp_token, None)
        raise HTTPException(401, "Session expired — log in again")
    user = await db.users.find_one({"email": pending["email"]})
    if not user:
        raise HTTPException(401, "User not found")
    totp = pyotp.TOTP(user["totp_secret"])
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(400, "Invalid 2FA code")
    _TOTP_PENDING.pop(payload.temp_token, None)
    token = create_access_token(pending["email"], pending["role"], pending.get("shop_id", "default"))
    return LoginResp(access_token=token, role=pending["role"], email=pending["email"])


@api.get("/auth/2fa/status")
async def totp_status(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]})
    return {"enabled": bool(fresh and fresh.get("totp_enabled")), "pyotp_available": _PYOTP_OK}


# ================================================================
# JOURNAL ENTRIES (Double-entry bookkeeping)
# ================================================================

class JournalLineIn(BaseModel):
    account: str
    debit: float = 0.0
    credit: float = 0.0

class JournalEntryIn(BaseModel):
    date: str  # YYYY-MM-DD
    description: str
    ref_no: Optional[str] = None
    lines: List[JournalLineIn]


@api.post("/journal-entries")
async def create_journal_entry(payload: JournalEntryIn, user: dict = Depends(require_owner)):
    total_debit = round(sum(l.debit for l in payload.lines), 2)
    total_credit = round(sum(l.credit for l in payload.lines), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(400, f"Journal entry must balance: debits={total_debit} credits={total_credit}")
    doc = {
        "id": str(uuid.uuid4()),
        "date": payload.date,
        "description": payload.description,
        "ref_no": payload.ref_no or "",
        "lines": [l.model_dump() for l in payload.lines],
        "total_debit": total_debit,
        "created_by": user["email"],
        "created_at": now_iso(),
    }
    await db.journal_entries.insert_one(doc)
    doc.pop("_id", None)
    await write_audit(user["email"], "create_journal_entry", "journal", doc["id"], {"description": payload.description})
    return doc


@api.get("/journal-entries")
async def list_journal_entries(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    q: dict = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    entries = await db.journal_entries.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    return entries


@api.get("/journal-entries/{entry_id}")
async def get_journal_entry(entry_id: str, _: dict = Depends(get_current_user)):
    entry = await db.journal_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(404, "Not found")
    return entry


@api.delete("/journal-entries/{entry_id}")
async def delete_journal_entry(entry_id: str, user: dict = Depends(require_owner)):
    entry = await db.journal_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(404, "Not found")
    await db.journal_entries.delete_one({"id": entry_id})
    await write_audit(user["email"], "delete_journal_entry", "journal", entry_id)
    return {"ok": True}


# ================================================================
# TRIAL BALANCE
# ================================================================

@api.get("/analytics/trial-balance")
async def trial_balance(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _: dict = Depends(get_current_user),
):
    today_str = datetime.now(timezone.utc).date().isoformat()
    df = date_from or (datetime.now(timezone.utc).replace(day=1).date().isoformat())
    dt = date_to or today_str

    accounts: dict = defaultdict(lambda: {"debit": 0.0, "credit": 0.0})

    async def _from_bills():
        q: dict = {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"}, "status": {"$ne": "cancelled"}}
        async for b in db.bills.find(q, {"_id": 0, "total_amount": 1, "payment_mode": 1, "tax_amount": 1, "discount_amount": 1}):
            rev = float(b.get("total_amount", 0))
            tax = float(b.get("tax_amount", 0))
            disc = float(b.get("discount_amount", 0))
            mode = b.get("payment_mode", "cash")
            ar_account = "Accounts Receivable (Credit)" if mode == "credit" else ("Bank" if mode in ("upi", "card", "neft") else "Cash")
            accounts[ar_account]["debit"] += rev
            accounts["Sales Revenue"]["credit"] += rev - tax
            accounts["GST Payable"]["credit"] += tax
            if disc > 0:
                accounts["Discount Allowed"]["debit"] += disc
                accounts["Sales Revenue"]["credit"] -= disc

    async def _from_purchases():
        q: dict = {"created_at": {"$gte": df, "$lte": dt + "T23:59:59"}, "status": {"$ne": "cancelled"}}
        async for p in db.purchases.find(q, {"_id": 0, "total_amount": 1, "status": 1}):
            amt = float(p.get("total_amount", 0))
            accounts["Purchase Expense"]["debit"] += amt
            accounts["Accounts Payable (Suppliers)"]["credit"] += amt

    async def _from_expenses():
        q: dict = {"date": {"$gte": df, "$lte": dt}}
        async for e in db.expenses.find(q, {"_id": 0, "amount": 1, "category": 1, "payment_mode": 1}):
            amt = float(e.get("amount", 0))
            cat = e.get("category", "General Expense")
            mode = e.get("payment_mode", "cash")
            bank_acc = "Bank" if mode in ("upi", "card", "neft") else "Cash"
            accounts[cat]["debit"] += amt
            accounts[bank_acc]["credit"] += amt

    async def _from_journal():
        q: dict = {"date": {"$gte": df, "$lte": dt}}
        async for je in db.journal_entries.find(q, {"_id": 0, "lines": 1}):
            for line in je.get("lines", []):
                acct = line.get("account", "Unknown")
                accounts[acct]["debit"] += float(line.get("debit", 0))
                accounts[acct]["credit"] += float(line.get("credit", 0))

    async def _from_supplier_payments():
        q: dict = {"date": {"$gte": df, "$lte": dt}}
        async for sp in db.supplier_payments.find(q, {"_id": 0, "amount": 1}):
            amt = float(sp.get("amount", 0))
            accounts["Accounts Payable (Suppliers)"]["debit"] += amt
            accounts["Cash"]["credit"] += amt

    await asyncio.gather(_from_bills(), _from_purchases(), _from_expenses(), _from_journal(), _from_supplier_payments())

    rows = []
    total_debit = total_credit = 0.0
    for acct, vals in sorted(accounts.items()):
        dr = round(vals["debit"], 2)
        cr = round(vals["credit"], 2)
        total_debit += dr
        total_credit += cr
        rows.append({"account": acct, "debit": dr, "credit": cr})

    return {
        "date_from": df,
        "date_to": dt,
        "rows": rows,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "balanced": abs(total_debit - total_credit) < 0.5,
    }


# ================================================================
# BALANCE SHEET (snapshot as of a date)
# ================================================================

@api.get("/analytics/balance-sheet")
async def balance_sheet(
    as_of: Optional[str] = Query(None),
    _: dict = Depends(get_current_user),
):
    dt = as_of or datetime.now(timezone.utc).date().isoformat()
    dt_end = dt + "T23:59:59"

    async def _stock_value():
        total = 0.0
        async for batch in db.batches.find({"quantity": {"$gt": 0}}, {"_id": 0, "quantity": 1, "purchase_price": 1, "mrp": 1}):
            price = float(batch.get("purchase_price") or batch.get("mrp", 0))
            total += int(batch.get("quantity", 0)) * price
        return round(total, 2)

    async def _receivables():
        total = 0.0
        async for b in db.bills.find({"payment_mode": "credit", "status": {"$ne": "cancelled"}, "created_at": {"$lte": dt_end}}, {"_id": 0, "total_amount": 1}):
            total += float(b.get("total_amount", 0))
        paid = 0.0
        async for cl in db.credit_ledger.find({"type": "payment", "date": {"$lte": dt}}, {"_id": 0, "amount": 1}):
            paid += float(cl.get("amount", 0))
        return round(max(total - paid, 0), 2)

    async def _payables():
        total = 0.0
        async for p in db.purchases.find({"status": {"$ne": "cancelled"}, "created_at": {"$lte": dt_end}}, {"_id": 0, "total_amount": 1}):
            total += float(p.get("total_amount", 0))
        paid = 0.0
        async for sp in db.supplier_payments.find({"date": {"$lte": dt}}, {"_id": 0, "amount": 1}):
            paid += float(sp.get("amount", 0))
        return round(max(total - paid, 0), 2)

    async def _cash_balance():
        cash_in = 0.0
        async for b in db.bills.find({"payment_mode": {"$in": ["cash"]}, "status": {"$ne": "cancelled"}, "created_at": {"$lte": dt_end}}, {"_id": 0, "total_amount": 1}):
            cash_in += float(b.get("total_amount", 0))
        cash_out = 0.0
        async for e in db.expenses.find({"date": {"$lte": dt}, "payment_mode": "cash"}, {"_id": 0, "amount": 1}):
            cash_out += float(e.get("amount", 0))
        async for sp in db.supplier_payments.find({"date": {"$lte": dt}, "payment_mode": "cash"}, {"_id": 0, "amount": 1}):
            cash_out += float(sp.get("amount", 0))
        return round(cash_in - cash_out, 2)

    async def _net_profit():
        revenue = 0.0
        async for b in db.bills.find({"status": {"$ne": "cancelled"}, "created_at": {"$lte": dt_end}}, {"_id": 0, "total_amount": 1}):
            revenue += float(b.get("total_amount", 0))
        cogs = 0.0
        async for p in db.purchases.find({"status": {"$ne": "cancelled"}, "created_at": {"$lte": dt_end}}, {"_id": 0, "total_amount": 1}):
            cogs += float(p.get("total_amount", 0))
        exp = 0.0
        async for e in db.expenses.find({"date": {"$lte": dt}}, {"_id": 0, "amount": 1}):
            exp += float(e.get("amount", 0))
        return round(revenue - cogs - exp, 2)

    stock_val, receivables, payables, cash_bal, net_profit = await asyncio.gather(
        _stock_value(), _receivables(), _payables(), _cash_balance(), _net_profit()
    )

    total_assets = round(cash_bal + stock_val + receivables, 2)
    total_liabilities = round(payables, 2)
    equity = round(net_profit, 2)

    return {
        "as_of": dt,
        "assets": {
            "cash": cash_bal,
            "inventory": stock_val,
            "receivables": receivables,
            "total": total_assets,
        },
        "liabilities": {
            "payables": payables,
            "total": total_liabilities,
        },
        "equity": {
            "retained_earnings": equity,
            "total": equity,
        },
        "balanced": abs(total_assets - (total_liabilities + equity)) < 1.0,
    }


# ================================================================
# STOCK-OUT PREDICTION (velocity-based)
# ================================================================

@api.get("/analytics/stockout-risk")
async def stockout_risk(_: dict = Depends(get_current_user)):
    thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()

    async def _medicine_stock():
        result = {}
        pipeline = [
            {"$match": {"quantity": {"$gt": 0}}},
            {"$group": {"_id": "$medicine_id", "stock": {"$sum": "$quantity"}}},
        ]
        async for doc in db.batches.aggregate(pipeline):
            result[doc["_id"]] = doc["stock"]
        return result

    async def _velocity():
        result: Dict[str, float] = defaultdict(float)
        pipeline = [
            {"$match": {"created_at": {"$gte": thirty_ago}, "status": {"$ne": "cancelled"}}},
            {"$lookup": {"from": "bill_lines", "localField": "id", "foreignField": "bill_id", "as": "lines"}},
            {"$unwind": "$lines"},
            {"$group": {"_id": "$lines.medicine_id", "sold": {"$sum": "$lines.quantity"}}},
        ]
        async for doc in db.bills.aggregate(pipeline):
            result[doc["_id"]] = doc["sold"] / 30.0
        return result

    async def _medicines():
        return {m["id"]: m for m in await db.medicines.find({}, {"_id": 0, "id": 1, "name": 1, "brand": 1, "reorder_level": 1}).to_list(5000)}

    stock_map, vel_map, med_map = await asyncio.gather(_medicine_stock(), _velocity(), _medicines())

    risks = []
    for med_id, stock in stock_map.items():
        if med_id not in med_map:
            continue
        daily_vel = vel_map.get(med_id, 0.0)
        med = med_map[med_id]
        reorder = int(med.get("reorder_level", 10))
        if daily_vel > 0:
            days_left = round(stock / daily_vel, 1)
        else:
            days_left = None

        if daily_vel == 0 and stock <= reorder:
            level = "low_stock"
        elif days_left is None:
            continue
        elif days_left <= 7:
            level = "critical"
        elif days_left <= 14:
            level = "high"
        elif days_left <= 30:
            level = "medium"
        else:
            continue

        risks.append({
            "medicine_id": med_id,
            "name": med.get("name", ""),
            "brand": med.get("brand", ""),
            "current_stock": stock,
            "daily_velocity": round(daily_vel, 2),
            "days_remaining": days_left,
            "reorder_level": reorder,
            "risk_level": level,
        })

    risks.sort(key=lambda r: (r["days_remaining"] or 999))
    return {"items": risks, "count": len(risks)}


# ================================================================
# MEDICINE SUGGESTIONS BY SYMPTOM
# ================================================================

_SYMPTOM_MAP: Dict[str, List[str]] = {
    "headache": ["paracetamol", "ibuprofen", "aspirin", "naproxen", "diclofenac"],
    "fever": ["paracetamol", "ibuprofen", "aspirin", "nimesulide"],
    "cold": ["cetirizine", "chlorpheniramine", "phenylephrine", "loratadine", "fexofenadine"],
    "cough": ["dextromethorphan", "codeine", "guaifenesin", "bromhexine", "ambroxol", "salbutamol"],
    "acidity": ["omeprazole", "pantoprazole", "ranitidine", "famotidine", "antacid", "esomeprazole"],
    "vomiting": ["ondansetron", "domperidone", "metoclopramide", "promethazine"],
    "nausea": ["ondansetron", "domperidone", "metoclopramide"],
    "diarrhea": ["loperamide", "metronidazole", "ciprofloxacin", "norfloxacin", "tinidazole", "electrolyte"],
    "constipation": ["lactulose", "bisacodyl", "senna", "ispaghula"],
    "pain": ["paracetamol", "ibuprofen", "diclofenac", "naproxen", "tramadol", "aspirin"],
    "allergy": ["cetirizine", "loratadine", "fexofenadine", "chlorpheniramine", "prednisolone"],
    "skin": ["hydrocortisone", "betamethasone", "calamine", "clotrimazole", "miconazole"],
    "infection": ["amoxicillin", "azithromycin", "ciprofloxacin", "cephalexin", "metronidazole"],
    "diabetes": ["metformin", "glipizide", "glibenclamide", "sitagliptin", "insulin"],
    "blood pressure": ["amlodipine", "atenolol", "losartan", "ramipril", "telmisartan"],
    "hypertension": ["amlodipine", "atenolol", "losartan", "ramipril", "telmisartan"],
    "anxiety": ["alprazolam", "clonazepam", "diazepam", "buspirone"],
    "sleep": ["zolpidem", "nitrazepam", "melatonin", "clonazepam"],
    "vitamins": ["vitamin d", "vitamin c", "vitamin b12", "folic acid", "iron", "calcium"],
    "asthma": ["salbutamol", "budesonide", "montelukast", "formoterol", "theophylline"],
    "thyroid": ["levothyroxine", "thyroxine", "neomercazole"],
    "cholesterol": ["atorvastatin", "rosuvastatin", "simvastatin", "fenofibrate"],
    "joint pain": ["ibuprofen", "diclofenac", "naproxen", "glucosamine", "methylprednisolone"],
    "eye": ["tobramycin", "ciprofloxacin eye", "moxifloxacin", "artificial tears", "timolol"],
    "ear": ["ciprofloxacin ear", "clotrimazole ear", "neomycin"],
    "wound": ["povidone iodine", "neomycin", "bacitracin", "silver sulfadiazine"],
    "dental": ["amoxicillin", "metronidazole", "ibuprofen", "diclofenac"],
}


@api.get("/medicines/suggest")
async def suggest_medicines(
    symptom: str = Query(..., min_length=2),
    limit: int = 10,
    _: dict = Depends(get_current_user),
):
    symptom_lower = symptom.strip().lower()
    keywords: List[str] = []
    for key, generics in _SYMPTOM_MAP.items():
        if key in symptom_lower or symptom_lower in key:
            keywords.extend(generics)
    keywords = list(dict.fromkeys(keywords))

    if not keywords:
        keywords = [symptom_lower]

    or_clauses = [
        {"generic": {"$regex": kw, "$options": "i"}} for kw in keywords[:10]
    ] + [
        {"name": {"$regex": kw, "$options": "i"}} for kw in keywords[:5]
    ]
    meds = await db.medicines.find(
        {"$or": or_clauses},
        {"_id": 0, "id": 1, "name": 1, "generic": 1, "brand": 1, "mrp": 1, "strength": 1, "total_stock": 1},
    ).to_list(limit * 3)

    pipeline = [
        {"$match": {"quantity": {"$gt": 0}}},
        {"$group": {"_id": "$medicine_id", "stock": {"$sum": "$quantity"}}},
    ]
    stock_map = {d["_id"]: d["stock"] async for d in db.batches.aggregate(pipeline)}
    for m in meds:
        m["total_stock"] = stock_map.get(m["id"], 0)

    meds.sort(key=lambda m: -m["total_stock"])
    return {"symptom": symptom, "suggestions": meds[:limit]}


# ================================================================
# SUBSCRIPTION PLAN MANAGEMENT
# ================================================================

_PLAN_FEATURES: dict = {
    "starter": {
        "max_staff": 3,
        "max_medicines": 500,
        "analytics": False,
        "multi_store": False,
        "api_access": False,
        "export_csv": True,
        "schedule_h": True,
        "two_factor_auth": False,
        "journal_entries": False,
    },
    "pro": {
        "max_staff": -1,  # unlimited
        "max_medicines": -1,
        "analytics": True,
        "multi_store": False,
        "api_access": True,
        "export_csv": True,
        "schedule_h": True,
        "two_factor_auth": True,
        "journal_entries": True,
    },
}


@api.get("/plan/features")
async def plan_features(_: dict = Depends(get_current_user)):
    shop = await db.shops.find_one({}, {"_id": 0, "plan": 1, "plan_expires": 1})
    current_plan = (shop or {}).get("plan", "starter")
    features = _PLAN_FEATURES.get(current_plan, _PLAN_FEATURES["starter"])
    return {"plan": current_plan, "features": features, "all_plans": _PLAN_FEATURES}


@api.post("/plan/upgrade")
async def plan_upgrade(
    payload: dict,
    user: dict = Depends(require_owner),
):
    plan = payload.get("plan", "pro")
    if plan not in _PLAN_FEATURES:
        raise HTTPException(400, "Unknown plan")
    expires = payload.get("expires")
    update: dict = {"plan": plan}
    if expires:
        update["plan_expires"] = expires
    await db.shops.update_one({}, {"$set": update})
    await write_audit(user["email"], "plan_upgrade", "shop", "shop", {"plan": plan})
    return {"ok": True, "plan": plan}


# ================================================================
# DATA RETENTION & BACKUP
# ================================================================

@api.get("/admin/backup")
async def backup_export(user: dict = Depends(require_owner)):
    collections = ["medicines", "batches", "bills", "bill_lines", "purchases", "purchase_lines",
                   "expenses", "customers", "suppliers", "supplier_payments", "credit_ledger",
                   "stock_adjustments", "journal_entries", "audit_events"]
    backup: dict = {"exported_at": now_iso(), "collections": {}}
    for coll_name in collections:
        docs = await db[coll_name].find({}, {"_id": 0}).to_list(50000)
        backup["collections"][coll_name] = docs
    await write_audit(user["email"], "backup_export", "system", "all")
    return backup


@api.post("/admin/purge-old-data")
async def purge_old_data(user: dict = Depends(require_owner)):
    shop = await db.shops.find_one({}, {"_id": 0, "data_retention_months": 1})
    months = int((shop or {}).get("data_retention_months", 60))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=months * 30)).date().isoformat()
    results: dict = {}
    for coll_name, date_field in [("audit_events", "created_at"), ("shifts", "clock_in")]:
        r = await db[coll_name].delete_many({date_field: {"$lt": cutoff}})
        results[coll_name] = r.deleted_count
    await write_audit(user["email"], "data_purge", "system", "all", {"cutoff": cutoff, "results": results})
    return {"cutoff": cutoff, "deleted": results}


# ================================================================
# PURCHASE FROM SCAN — AI stock auto-update
# ================================================================

class ScanImportLine(BaseModel):
    medicine_id: str
    medicine_name: str
    batch_no: str = "SCAN"
    expiry: str = ""
    quantity: int
    purchase_price: float
    mrp: float = 0.0

class ScanImportIn(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = ""
    invoice_no: Optional[str] = ""
    invoice_date: Optional[str] = None
    lines: List[ScanImportLine]


@api.post("/purchases/from-scan")
async def purchase_from_scan(payload: ScanImportIn, user: dict = Depends(get_current_user)):
    if not payload.lines:
        raise HTTPException(400, "No lines to import")
    today = datetime.now(timezone.utc).date().isoformat()
    pid = str(uuid.uuid4())
    now = now_iso()
    total = round(sum(l.quantity * l.purchase_price for l in payload.lines), 2)

    supplier_name = payload.supplier_name or ""
    if payload.supplier_id and not supplier_name:
        s = await db.suppliers.find_one({"id": payload.supplier_id})
        supplier_name = s["name"] if s else ""

    purchase_doc = {
        "id": pid,
        "supplier_id": payload.supplier_id,
        "supplier_name": supplier_name,
        "invoice_no": payload.invoice_no or f"SCAN-{today}",
        "invoice_date": payload.invoice_date or today,
        "total_amount": total,
        "paid_amount": 0.0,
        "payment_mode": "credit",
        "status": "received",
        "invoice_doc_url": None,
        "source": "scan_import",
        "created_at": now,
        "created_by": user["email"],
        "shop_id": user.get("_shop_id", "default"),
    }
    await db.purchases.insert_one(purchase_doc)

    for line in payload.lines:
        expiry = line.expiry or (datetime.now(timezone.utc).date().replace(year=datetime.now(timezone.utc).year + 2)).isoformat()
        mrp = line.mrp or line.purchase_price * 1.2
        existing = await db.batches.find_one(
            {"medicine_id": line.medicine_id, "batch_no": line.batch_no, "expiry": expiry}
        )
        if existing:
            await db.batches.update_one(
                {"id": existing["id"]},
                {"$inc": {"quantity": line.quantity}, "$set": {"purchase_price": line.purchase_price, "mrp": mrp}},
            )
        else:
            await db.batches.insert_one({
                "id": str(uuid.uuid4()),
                "medicine_id": line.medicine_id,
                "batch_no": line.batch_no,
                "expiry": expiry,
                "quantity": line.quantity,
                "purchase_price": line.purchase_price,
                "mrp": mrp,
                "created_at": now,
            })
        pl = {
            "id": str(uuid.uuid4()),
            "purchase_id": pid,
            "medicine_id": line.medicine_id,
            "medicine_name": line.medicine_name,
            "batch_no": line.batch_no,
            "expiry": expiry,
            "quantity": line.quantity,
            "purchase_price": line.purchase_price,
            "mrp": mrp,
        }
        await db.purchase_lines.insert_one(pl)

    await write_audit(user["email"], "scan_import_purchase", "purchase", pid, {"lines": len(payload.lines), "total": total})
    purchase_doc.pop("_id", None)
    return {"ok": True, "purchase_id": pid, "lines_imported": len(payload.lines), "total": total}


@api.get("/medicines/match")
async def match_medicine_for_scan(
    q: str = Query(..., min_length=2),
    _: dict = Depends(get_current_user),
):
    results = await db.medicines.find(
        {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"generic": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
        ]},
        {"_id": 0, "id": 1, "name": 1, "generic": 1, "brand": 1, "mrp": 1, "strength": 1},
    ).to_list(10)
    return results


# ================================================================
# OCR BILL SCAN (text-PDF extraction; scanned images need Tesseract)
# ================================================================

@api.post("/purchases/scan")
async def scan_invoice(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    import re as _re
    allowed = {"application/pdf", "image/jpeg", "image/png", "image/webp", "image/jpg"}
    ct = (file.content_type or "").split(";")[0].strip()
    if ct not in allowed:
        raise HTTPException(400, f"Upload a PDF or image (got {ct!r})")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10 MB)")

    raw_text = ""
    method_used = "none"

    if ct == "application/pdf":
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                raw_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            method_used = "pdfplumber"
        except Exception:
            pass

    if not raw_text:  # image or scanned PDF — try Tesseract
        try:
            import pytesseract  # type: ignore
            from PIL import Image as _PILImage  # type: ignore
            pytesseract.pytesseract.tesseract_cmd = "/opt/homebrew/bin/tesseract"
            img = _PILImage.open(io.BytesIO(data)).convert("RGB")
            raw_text = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
            method_used = "tesseract-ocr"
        except Exception as _e:
            raw_text = ""

    # ----- Parse pharma invoice lines -----
    lines_out = []
    if raw_text:
        # Skip known header/footer keywords
        SKIP_WORDS = {
            "invoice", "bill", "total", "subtotal", "grand", "gst", "cgst", "sgst",
            "particulars", "medicine", "description", "amount", "rate", "batch",
            "qty", "quantity", "mrp", "disc", "discount", "tax", "net", "hsn",
            "note", "terms", "rupees", "ledger", "print", "made", "signature",
            "bank", "branch", "micr", "ifsc", "gross", "taxable", "page",
        }
        EXP_PAT    = _re.compile(r"\b(\d{2}/\d{2})\b|\b(20\d{2}-\d{2})\b")
        PRICE_PAT  = _re.compile(r"[₹nN]?\s*(\d{1,6}\.\d{2})\b")
        QTY_PAT    = _re.compile(r"\b(\d{1,5})\b")
        NAME_PAT   = _re.compile(r"([A-Z][A-Za-z0-9\-/. ]{2,40}?(?:\s+\d+\s*(?:mg|ml|mcg|iu|g|tab|cap))?)", _re.I)

        for line in raw_text.splitlines():
            line = line.strip()
            if not line or len(line) < 8:
                continue
            # Must start with a 1-3 digit serial number (not HSN/barcode numbers)
            sr_m = _re.match(r"^(\d{1,3})[.\s]", line)
            if not sr_m:
                continue
            # Skip lines that are clearly headers/footers
            low = line.lower()
            if any(w in low for w in SKIP_WORDS) and not _re.search(r"[a-zA-Z]{4,}", line):
                continue
            # Skip lines where the "serial number" part of a street address (e.g. "123 Main Road")
            after_num = line[sr_m.end():].strip()
            if _re.match(r"[A-Z][a-z]", after_num) and not _re.search(r"\d", after_num):
                continue

            # Strip leading sr number and optional HSN (8-digit code)
            body = _re.sub(r"^\d{1,3}[.\s]+", "", line).strip()
            body = _re.sub(r"^\d{8}\s+", "", body).strip()

            # Extract expiry MM/YY → YYYY-MM
            expiry = None
            exp_m = EXP_PAT.search(body)
            if exp_m:
                raw_exp = exp_m.group(1) or exp_m.group(2)
                try:
                    if "/" in raw_exp:
                        mm, yy = raw_exp.split("/")
                        expiry = f"20{yy}-{mm.zfill(2)}"
                    else:
                        expiry = raw_exp
                except Exception:
                    pass

            # Extract all decimal numbers as candidate prices
            prices = [float(m.group(1)) for m in PRICE_PAT.finditer(body)]
            price = prices[-2] if len(prices) >= 2 else (prices[0] if prices else None)

            # Extract integers as candidate quantities — skip numbers followed by units (mg, ml, g, etc.)
            unit_suffix = _re.compile(r"\d+\s*(?:mg|ml|mcg|iu|g|tab|cap|gm)\b", _re.I)
            unit_spans = {m.start() for m in unit_suffix.finditer(body)}
            ints = []
            for m in QTY_PAT.finditer(body):
                v = int(m.group(1))
                if 1 <= v <= 9999 and not any(abs(m.start() - us) < 6 for us in unit_spans):
                    ints.append(v)
            # Prefer quantities that come after most of the text (near end), before prices
            first_price_pos = PRICE_PAT.search(body)
            if first_price_pos and ints:
                pre_price_ints = [int(m.group(1)) for m in QTY_PAT.finditer(body[:first_price_pos.start()])
                                  if 1 <= int(m.group(1)) <= 9999
                                  and not any(abs(m.start() - us) < 6 for us in unit_spans)]
                qty = pre_price_ints[-1] if pre_price_ints else (ints[0] if ints else None)
            else:
                qty = ints[0] if ints else None

            # Extract medicine name: text leading up to the first price
            name = None
            first_price = PRICE_PAT.search(body)
            if first_price:
                before_price = body[:first_price.start()].strip()
                # Strip trailing stand-alone integers (qty, pack)
                before_price = _re.sub(r"(\s+\d+)+\s*$", "", before_price).strip()
                # Strip trailing batch-code (e.g. PCM101, VTC555)
                before_price = _re.sub(r"\s+[A-Z]{1,4}\d{3,}\s*$", "", before_price, flags=_re.I).strip()
                # Strip trailing *-N style suffixes
                before_price = _re.sub(r"\s+\*[-\w]+$", "", before_price).strip()
                # Strip trailing parenthetical like (10 tabs) after other cleanup
                before_price = _re.sub(r"\s*\([^)]+\)\s*$", "", before_price).strip()
                if len(before_price) >= 3:
                    name = before_price
            if not name:
                name_m = NAME_PAT.search(body)
                if name_m:
                    name = name_m.group(1).strip()

            if name or qty or price:
                lines_out.append({
                    "raw": line[:120],
                    "name_hint": name,
                    "qty_hint": qty,
                    "price_hint": price,
                    "batch_hint": None,
                    "expiry_hint": expiry,
                    "pack_hint": None,
                })

    # ----- Extract supplier name from invoice header -----
    supplier_hint = None
    if raw_text:
        # Look for company-like name in first 10 lines
        for hline in raw_text.splitlines()[:10]:
            hline = hline.strip()
            # Company name is usually ALL CAPS or Title Case with LTD/PVT/PHARMA keywords
            if _re.search(r"\b(?:pvt|ltd|llp|pharma|medical|medicals|distributors?|agencies|solutions)\b", hline, _re.I):
                supplier_hint = hline[:80]
                break
            # If it's a long ALL-CAPS line in the first few, likely company name
            if len(hline) > 8 and hline == hline.upper() and _re.search(r"[A-Z]{3}", hline):
                supplier_hint = hline[:80]
                break

    note_map = {
        "pdfplumber": "PDF text extracted successfully",
        "tesseract-ocr": "Image OCR complete (Tesseract)",
        "none": "Could not extract text. Try a clearer image or a digital PDF.",
    }
    return {
        "raw_text": raw_text[:5000] if raw_text else None,
        "parsed_lines": lines_out[:60],
        "note": note_map[method_used],
        "ocr_available": bool(raw_text),
        "method": method_used,
        "supplier_hint": supplier_hint,
    }


# ------------------------ Include Router ------------------------ #
app.include_router(api)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")

_cors_env = os.getenv("CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else ["*"]

app.add_middleware(
    CORSMiddleware,
    # credentials=True requires explicit origins — cannot combine with wildcard.
    allow_credentials=bool(_cors_env),
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
