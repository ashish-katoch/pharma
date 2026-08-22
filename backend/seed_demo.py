"""One-off demo data seeder — hits the running API as the owner account.

Idempotent-ish: skips creating medicines if any already exist.
Run: /root/.venv/bin/python seed_demo.py
"""
import datetime as dt
import sys
import urllib.parse
import urllib.request
import json

BASE = "http://localhost:8001/api"


def req(method, path, token=None, body=None, form=None):
    url = f"{BASE}{path}"
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    _, login = req("POST", "/auth/login", form={"username": "owner@pharma.com", "password": "Owner@123"})
    token = login["access_token"]
    print("logged in")

    status, existing = req("GET", "/medicines", token=token)
    if isinstance(existing, dict) and existing.get("items"):
        existing = existing["items"]
    if isinstance(existing, list) and len(existing) > 5:
        print(f"medicines already present ({len(existing)}) — skipping seed")
        return

    today = dt.date.today()

    def d(days):
        return (today + dt.timedelta(days=days)).isoformat()

    # (name, generic, manufacturer, gst, mrp, schedule_h, reorder, batches[(no,exp_days,qty,pp,sp)])
    meds = [
        ("Dolo 650 Tablet", "Paracetamol 650mg", "Micro Labs", 12, 30.5, False, 20,
         [("DL2401", 400, 120, 22, 30.5), ("DL2312", 20, 8, 22, 30.5)]),
        ("Azithral 500 Tablet", "Azithromycin 500mg", "Alembic", 12, 118.0, True, 10,
         [("AZ2405", 300, 45, 78, 118.0)]),
        ("Pan 40 Tablet", "Pantoprazole 40mg", "Alkem", 12, 145.0, False, 15,
         [("PN2403", 250, 60, 96, 145.0), ("PN2311", 55, 5, 96, 145.0)]),
        ("Augmentin 625 Duo", "Amoxycillin+Clavulanic", "GSK", 12, 205.0, True, 10,
         [("AG2404", 500, 30, 150, 205.0)]),
        ("Crocin Advance", "Paracetamol 500mg", "GSK", 12, 25.0, False, 25,
         [("CR2402", 600, 200, 18, 25.0)]),
        ("Shelcal 500", "Calcium+Vit D3", "Torrent", 12, 112.0, False, 12,
         [("SC2312", 700, 3, 80, 112.0)]),
        ("Thyronorm 100mcg", "Thyroxine 100mcg", "Abbott", 5, 168.0, False, 10,
         [("TH2401", 350, 40, 120, 168.0)]),
        ("Ecosprin 75", "Aspirin 75mg", "USV", 12, 12.5, False, 30,
         [("EC2405", 800, 150, 8, 12.5), ("EC2310", 25, 12, 8, 12.5)]),
        ("Montek LC", "Montelukast+Levocet", "Sun Pharma", 12, 195.0, False, 10,
         [("MK2403", 260, 22, 140, 195.0)]),
        ("Zerodol SP", "Aceclofenac+Serratio", "Ipca", 12, 132.0, False, 12,
         [("ZD2402", 300, 6, 95, 132.0)]),
        ("Betadine Ointment", "Povidone Iodine", "Win-Medicare", 12, 148.0, False, 8,
         [("BT2401", 900, 35, 100, 148.0)]),
        ("Volini Gel 50g", "Diclofenac Gel", "Sun Pharma", 18, 165.0, False, 10,
         [("VG2312", 40, 4, 118, 165.0)]),
    ]

    # a supplier
    req("POST", "/suppliers", token=token, body={"name": "MediSource Distributors", "phone": "9876543210", "gstin": "29AABCS1234K1Z9"})
    # a customer
    req("POST", "/customers", token=token, body={"name": "Rajesh Kumar", "phone": "9845012345"})

    created = 0
    for (name, generic, mfr, gst, mrp, sch, reorder, batches) in meds:
        st, med = req("POST", "/medicines", token=token, body={
            "name": name, "generic_name": generic, "manufacturer": mfr,
            "gst_rate": gst, "mrp": mrp, "schedule_h": sch, "reorder_level": reorder,
        })
        if st not in (200, 201):
            print("med fail", name, st, med)
            continue
        mid = med["id"]
        for (bno, exp_days, qty, pp, sp) in batches:
            st2, b = req("POST", "/batches", token=token, body={
                "medicine_id": mid, "batch_no": bno, "expiry_date": d(exp_days),
                "qty": qty, "purchase_price": pp, "selling_price": sp,
            })
            if st2 not in (200, 201):
                print("batch fail", name, bno, st2, b)
        created += 1
    print(f"created {created} medicines with batches")


if __name__ == "__main__":
    main()
