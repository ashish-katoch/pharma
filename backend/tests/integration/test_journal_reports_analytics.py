from datetime import date

from httpx import AsyncClient


async def test_journal_entry_must_balance(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}

    unbalanced = await client.post(
        "/api/journal-entries",
        json={
            "entry_date": "2026-08-01",
            "lines": [
                {"account": "cash", "debit": 100, "credit": 0},
                {"account": "sales", "debit": 0, "credit": 50},
            ],
        },
        headers=headers,
    )
    assert unbalanced.status_code == 400

    balanced = await client.post(
        "/api/journal-entries",
        json={
            "entry_date": "2026-08-01",
            "lines": [
                {"account": "cash", "debit": 100, "credit": 0},
                {"account": "sales", "debit": 0, "credit": 100},
            ],
        },
        headers=headers,
    )
    assert balanced.status_code == 200
    entry_id = balanced.json()["id"]

    listed = await client.get("/api/journal-entries", headers=headers)
    assert any(e["id"] == entry_id for e in listed.json())

    deleted = await client.delete(f"/api/journal-entries/{entry_id}", headers=headers)
    assert deleted.status_code == 200


async def test_journal_entry_delete_requires_owner(client: AsyncClient, owner_token: str, staff_token: str):
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}

    denied = await client.post(
        "/api/journal-entries",
        json={"entry_date": "2026-08-01", "lines": [{"account": "cash", "debit": 10, "credit": 0}, {"account": "sales", "debit": 0, "credit": 10}]},
        headers=staff_headers,
    )
    assert denied.status_code == 403

    created = await client.post(
        "/api/journal-entries",
        json={"entry_date": "2026-08-01", "lines": [{"account": "cash", "debit": 10, "credit": 0}, {"account": "sales", "debit": 0, "credit": 10}]},
        headers=owner_headers,
    )
    entry_id = created.json()["id"]

    denied_delete = await client.delete(f"/api/journal-entries/{entry_id}", headers=staff_headers)
    assert denied_delete.status_code == 403


async def _sell(client: AsyncClient, headers: dict, gst_rate: float, unit_price: float, purchase_price: float, qty: int) -> dict:
    med = await client.post("/api/medicines", json={"name": "AnalyticsMed", "gst_rate": gst_rate}, headers=headers)
    med_id = med.json()["id"]
    await client.post(
        "/api/batches",
        json={
            "medicine_id": med_id,
            "batch_no": "A1",
            "expiry_date": "2030-01-01",
            "qty": qty,
            "purchase_price": purchase_price,
            "selling_price": unit_price,
        },
        headers=headers,
    )
    bill = await client.post(
        "/api/bills",
        json={"lines": [{"medicine_id": med_id, "qty": qty}], "discount": 0, "payment_mode": "cash"},
        headers=headers,
    )
    return bill.json()


async def test_gst_summary_matches_hand_calculation(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    bill = await _sell(client, headers, gst_rate=12, unit_price=100, purchase_price=50, qty=3)
    assert bill["subtotal"] == 300.0
    assert bill["gst_amount"] == 36.0
    assert bill["total"] == 336.0

    month = date.today().strftime("%Y-%m")
    summary = await client.get(f"/api/reports/gst-summary?month={month}", headers=headers)
    assert summary.status_code == 200
    body = summary.json()
    assert body["taxable_value"] == 300.0
    assert body["gst_collected"] == 36.0
    assert body["total_sales"] == 336.0

    gstr1 = await client.get(f"/api/reports/gstr1?month={month}", headers=headers)
    assert gstr1.status_code == 200
    rate_wise = gstr1.json()["rate_wise"]
    assert any(r["gst_rate"] == 12.0 and r["taxable_value"] == 300.0 for r in rate_wise)


async def test_pnl_excludes_gst_and_subtracts_cogs(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    # unit_price=80, gst=5%, purchase_price=40, qty=5 -> subtotal=400, cogs=200, profit=200
    await _sell(client, headers, gst_rate=5, unit_price=80, purchase_price=40, qty=5)

    month = date.today().strftime("%Y-%m")
    pnl = await client.get(f"/api/analytics/pnl?month={month}", headers=headers)
    assert pnl.status_code == 200
    body = pnl.json()
    assert body["revenue"] == 400.0
    assert body["cogs"] == 200.0
    assert body["profit"] == 200.0


async def test_sales_and_low_stock_reports(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    bill = await _sell(client, headers, gst_rate=18, unit_price=50, purchase_price=20, qty=2)

    month = date.today().strftime("%Y-%m")
    sales = await client.get(f"/api/analytics/sales?month={month}", headers=headers)
    assert sales.status_code == 200
    assert sales.json()["bill_count"] >= 1
    assert sales.json()["total_sales"] >= bill["total"]

    low_stock = await client.get("/api/reports/low-stock?threshold=1000", headers=headers)
    assert low_stock.status_code == 200
    assert len(low_stock.json()) >= 1
