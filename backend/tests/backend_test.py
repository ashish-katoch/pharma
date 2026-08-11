"""Pharma Counter — pytest backend tests.

Tests are ordered; some depend on previous state (medicine/bill creation, FEFO, cancel).
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"username": "owner@pharma.com", "password": "Owner@123"}
STAFF = {"username": "staff@pharma.com", "password": "Staff@123"}


# ----------------- Fixtures ----------------- #
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", data=OWNER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{API}/auth/login", data=STAFF, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ----------------- Health / Auth ----------------- #
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_owner_and_staff(owner_token, staff_token):
    assert owner_token and staff_token


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login", data={"username": OWNER["username"], "password": "wrong"})
    assert r.status_code == 400


def test_auth_me_returns_role(owner_token, staff_token):
    ro = requests.get(f"{API}/auth/me", headers=h(owner_token)).json()
    rs = requests.get(f"{API}/auth/me", headers=h(staff_token)).json()
    assert ro["role"] == "owner" and ro["email"] == OWNER["username"]
    assert rs["role"] == "staff"


# ----------------- Staff mgmt (owner only) ----------------- #
def test_staff_list_forbidden_for_staff(staff_token):
    r = requests.get(f"{API}/auth/staff", headers=h(staff_token))
    assert r.status_code == 403


def test_staff_crud(owner_token):
    email = f"TEST_staff_{uuid.uuid4().hex[:6]}@pharma.com"
    r = requests.post(f"{API}/auth/staff", headers=h(owner_token),
                      json={"email": email, "password": "Pass@123", "name": "TEST User"})
    assert r.status_code == 200, r.text
    staff_id = r.json()["id"]

    lst = requests.get(f"{API}/auth/staff", headers=h(owner_token)).json()
    assert any(u["id"] == staff_id for u in lst)

    dr = requests.delete(f"{API}/auth/staff/{staff_id}", headers=h(owner_token))
    assert dr.status_code == 200

    lst2 = requests.get(f"{API}/auth/staff", headers=h(owner_token)).json()
    assert not any(u["id"] == staff_id for u in lst2)


# ----------------- Shop ----------------- #
def test_shop_get_and_update(owner_token, staff_token):
    r = requests.get(f"{API}/shop", headers=h(staff_token))
    assert r.status_code == 200
    original_phone = r.json()["phone"]

    # staff cannot update
    rs = requests.put(f"{API}/shop", headers=h(staff_token), json={"phone": "+91 9000000000"})
    assert rs.status_code == 403

    # owner can
    ro = requests.put(f"{API}/shop", headers=h(owner_token), json={"phone": "+91 9000000000"})
    assert ro.status_code == 200 and ro.json()["phone"] == "+91 9000000000"

    # restore
    requests.put(f"{API}/shop", headers=h(owner_token), json={"phone": original_phone})


# ----------------- Medicines ----------------- #
def test_medicines_seeded_and_search(owner_token):
    r = requests.get(f"{API}/medicines", headers=h(owner_token))
    assert r.status_code == 200
    meds = r.json()
    assert len(meds) >= 20
    for m in meds[:5]:
        assert "total_stock" in m and m["total_stock"] >= 0

    rq = requests.get(f"{API}/medicines?q=paracetamol", headers=h(owner_token)).json()
    assert any("paracetamol" in m["name"].lower() for m in rq)


def test_medicine_crud(owner_token):
    payload = {"name": "TEST_MedX", "brand": "TestBrand", "generic": "TestGen",
               "strength": "10mg", "pack": "1 strip", "hsn": "3004", "schedule": "OTC",
               "gst_rate": 12.0, "mrp": 50.0, "reorder_level": 5}
    cr = requests.post(f"{API}/medicines", headers=h(owner_token), json=payload)
    assert cr.status_code == 200, cr.text
    mid = cr.json()["id"]

    gr = requests.get(f"{API}/medicines/{mid}", headers=h(owner_token))
    assert gr.status_code == 200 and gr.json()["name"] == "TEST_MedX"

    payload["name"] = "TEST_MedX_Updated"
    ur = requests.put(f"{API}/medicines/{mid}", headers=h(owner_token), json=payload)
    assert ur.status_code == 200 and ur.json()["name"] == "TEST_MedX_Updated"

    dr = requests.delete(f"{API}/medicines/{mid}", headers=h(owner_token))
    assert dr.status_code == 200


# ----------------- Batches ----------------- #
def test_batches_list_and_create(owner_token):
    meds = requests.get(f"{API}/medicines", headers=h(owner_token)).json()
    med = meds[0]
    lst = requests.get(f"{API}/batches?medicine_id={med['id']}", headers=h(owner_token))
    assert lst.status_code == 200 and len(lst.json()) >= 2

    expiry = (date.today() + timedelta(days=200)).isoformat()
    payload = {"medicine_id": med["id"], "batch_no": f"TESTB{uuid.uuid4().hex[:4]}",
               "expiry": expiry, "quantity": 10, "mrp": med["mrp"], "purchase_price": 20.0}
    cr = requests.post(f"{API}/batches", headers=h(owner_token), json=payload)
    assert cr.status_code == 200, cr.text
    assert cr.json()["quantity"] == 10


# ----------------- Bills / FEFO ----------------- #
@pytest.fixture(scope="module")
def bill_test_med(owner_token):
    """Return a medicine and its batches for FEFO testing."""
    meds = requests.get(f"{API}/medicines", headers=h(owner_token)).json()
    # pick paracetamol
    med = next((m for m in meds if "paracetamol" in m["name"].lower()), meds[0])
    return med


def test_create_bill_fefo(owner_token, bill_test_med):
    med = bill_test_med
    # get sorted batches (by expiry asc) — earliest expiry should be picked first
    batches = requests.get(f"{API}/batches?medicine_id={med['id']}", headers=h(owner_token)).json()
    earliest = min(batches, key=lambda b: b["expiry"])

    payload = {"lines": [{"medicine_id": med["id"], "quantity": 3, "discount_pct": 0}],
               "customer_name": "TEST_Cust", "payment_mode": "cash"}
    r = requests.post(f"{API}/bills", headers=h(owner_token), json=payload)
    assert r.status_code == 200, r.text
    bill = r.json()
    assert bill["status"] == "active"
    assert len(bill["lines"]) >= 1
    # FEFO: first line's batch should be earliest expiry batch
    assert bill["lines"][0]["batch_id"] == earliest["id"], "FEFO not picking earliest expiry batch"
    # GST split — cgst == sgst (approx)
    assert abs(bill["cgst_total"] - bill["sgst_total"]) < 0.05
    # grand_total sanity — MRP is inclusive, so grand_total ~ mrp * qty for zero discount
    expected = round(3 * float(earliest["mrp"]), 2)
    assert abs(bill["grand_total"] - expected) < 0.5
    # store bill id for other tests via module-level dict
    _shared["bill_id"] = bill["id"]
    _shared["bill_med_id"] = med["id"]
    _shared["consumed_batch_id"] = earliest["id"]
    _shared["consumed_qty"] = bill["lines"][0]["quantity"]


_shared = {}


def test_get_bill_and_list(owner_token):
    bill_id = _shared["bill_id"]
    r = requests.get(f"{API}/bills/{bill_id}", headers=h(owner_token))
    assert r.status_code == 200 and r.json()["id"] == bill_id

    lst = requests.get(f"{API}/bills", headers=h(owner_token))
    assert lst.status_code == 200 and any(b["id"] == bill_id for b in lst.json())


def test_bill_insufficient_stock(owner_token, bill_test_med):
    payload = {"lines": [{"medicine_id": bill_test_med["id"], "quantity": 999999, "discount_pct": 0}]}
    r = requests.post(f"{API}/bills", headers=h(owner_token), json=payload)
    assert r.status_code == 400
    assert "insufficient" in r.text.lower() or "short" in r.text.lower()


def test_cancel_bill_reverses_stock(owner_token):
    bill_id = _shared["bill_id"]
    med_id = _shared["bill_med_id"]
    batch_id = _shared["consumed_batch_id"]
    qty = _shared["consumed_qty"]

    before = requests.get(f"{API}/batches?medicine_id={med_id}", headers=h(owner_token)).json()
    before_qty = next(b["quantity"] for b in before if b["id"] == batch_id)

    r = requests.post(f"{API}/bills/{bill_id}/cancel", headers=h(owner_token))
    assert r.status_code == 200 and r.json()["status"] == "cancelled"

    after = requests.get(f"{API}/batches?medicine_id={med_id}", headers=h(owner_token)).json()
    after_qty = next(b["quantity"] for b in after if b["id"] == batch_id)
    assert after_qty == before_qty + qty


# ----------------- Reports / Stats ----------------- #
def test_reports_low_stock(owner_token):
    r = requests.get(f"{API}/reports/low-stock", headers=h(owner_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_reports_expiring(owner_token):
    r = requests.get(f"{API}/reports/expiring?window=60", headers=h(owner_token))
    assert r.status_code == 200
    data = r.json()
    # seeded near-expiry batch at 45d — should show up in 60d window
    assert len(data) >= 1
    for b in data[:5]:
        assert "medicine_name" in b and "expiry" in b


def test_stats_today(owner_token):
    r = requests.get(f"{API}/stats/today", headers=h(owner_token))
    assert r.status_code == 200
    d = r.json()
    for k in ("sales_total", "bill_count", "low_stock_count", "expiring_30_count"):
        assert k in d


# ─────────────────── Regression: C1 — change_password (field name bug) ─────── #
def test_change_password_works_end_to_end(owner_token):
    """C1 regression: change_password must read/write hashed_password, not password."""
    # Change to a new password.
    r = requests.post(
        f"{API}/auth/change-password",
        headers=h(owner_token),
        json={"current_password": "Owner@123", "new_password": "Owner@456"},
    )
    assert r.status_code == 200, f"change_password failed: {r.text}"

    # New password must work for login.
    r2 = requests.post(f"{API}/auth/login", data={"username": "owner@pharma.com", "password": "Owner@456"})
    assert r2.status_code == 200, "Login with new password failed — C1 bug may have recurred"

    # Old password must no longer work.
    r3 = requests.post(f"{API}/auth/login", data={"username": "owner@pharma.com", "password": "Owner@123"})
    assert r3.status_code == 400, "Old password still works after change — C1 bug"

    # Restore original password so other tests keep working.
    new_token = r2.json()["access_token"]
    r4 = requests.post(
        f"{API}/auth/change-password",
        headers=h(new_token),
        json={"current_password": "Owner@456", "new_password": "Owner@123"},
    )
    assert r4.status_code == 200, f"Restore password failed: {r4.text}"


# ─────────────────── Regression: C2 — atomic stock deduction ─────────────────── #
def test_stock_deduction_is_exact(owner_token, bill_test_med):
    """C2 regression: stock must drop by exactly the billed quantity — no race or set mismatch."""
    med = bill_test_med
    batches_before = requests.get(f"{API}/batches?medicine_id={med['id']}", headers=h(owner_token)).json()
    earliest = min(batches_before, key=lambda b: b["expiry"])
    qty_before = earliest["quantity"]

    sell_qty = min(2, qty_before)  # never request more than available
    payload = {
        "lines": [{"medicine_id": med["id"], "quantity": sell_qty, "discount_pct": 0}],
        "payment_mode": "cash",
    }
    bill_r = requests.post(f"{API}/bills", headers=h(owner_token), json=payload)
    assert bill_r.status_code == 200, bill_r.text
    bill_id = bill_r.json()["id"]

    batches_after = requests.get(f"{API}/batches?medicine_id={med['id']}", headers=h(owner_token)).json()
    batch_after = next(b for b in batches_after if b["id"] == earliest["id"])
    assert batch_after["quantity"] == qty_before - sell_qty, (
        f"Stock mismatch: expected {qty_before - sell_qty}, got {batch_after['quantity']} — C2 regression"
    )

    # Clean up: cancel the bill to restore stock.
    requests.post(f"{API}/bills/{bill_id}/cancel", headers=h(owner_token))


# ─────────────────── Regression: C3 — analytics field names ──────────────────── #
def test_analytics_returns_real_data(owner_token):
    """C3 regression: analytics must use medicine_name/line_total/total_discount, not name/total/discount."""
    # Create a bill so there's something to aggregate.
    meds = requests.get(f"{API}/medicines", headers=h(owner_token)).json()
    med = meds[0]
    payload = {
        "lines": [{"medicine_id": med["id"], "quantity": 1, "discount_pct": 0}],
        "payment_mode": "cash",
    }
    bill_r = requests.post(f"{API}/bills", headers=h(owner_token), json=payload)
    assert bill_r.status_code == 200, bill_r.text
    bill_id = bill_r.json()["id"]

    from datetime import datetime, timezone
    month = datetime.now(timezone.utc).strftime("%Y-%m")

    sales = requests.get(f"{API}/analytics/sales?month={month}", headers=h(owner_token)).json()
    assert sales["bill_count"] >= 1, "Sales analytics returned 0 bills — C3 regression likely"
    assert sales["total_revenue"] > 0, "Sales analytics returned zero revenue — C3 regression (wrong field name)"
    assert len(sales["top_by_qty"]) >= 1
    top = sales["top_by_qty"][0]
    assert top["name"] not in ("Unknown", ""), f"Medicine name is '{top['name']}' — C3 medicine_name field bug"
    assert top["qty"] > 0 and top["revenue"] > 0, "Top medicine has zero qty/revenue — C3 line_total field bug"

    staff = requests.get(f"{API}/analytics/staff?month={month}", headers=h(owner_token)).json()
    assert staff["total_bills"] >= 1
    assert any(s["revenue"] > 0 for s in staff["staff"]), "Staff analytics all zero revenue — C3 regression"

    pnl = requests.get(f"{API}/analytics/pnl?month={month}", headers=h(owner_token)).json()
    assert pnl["revenue"] > 0, "PnL revenue is zero — C3 grand_total field bug"

    # Clean up.
    requests.post(f"{API}/bills/{bill_id}/cancel", headers=h(owner_token))
