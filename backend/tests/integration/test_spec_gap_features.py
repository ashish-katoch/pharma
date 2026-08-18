from datetime import date

from httpx import AsyncClient


async def _create_medicine(client: AsyncClient, headers: dict, **overrides) -> str:
    payload = {"name": "TestMed", "gst_rate": 12}
    payload.update(overrides)
    resp = await client.post("/api/medicines", json=payload, headers=headers)
    return resp.json()["id"]


async def _create_batch(client: AsyncClient, headers: dict, medicine_id: str, **overrides) -> str:
    payload = {
        "medicine_id": medicine_id, "batch_no": "B1", "expiry_date": "2030-01-01",
        "qty": 20, "purchase_price": 40, "selling_price": 80,
    }
    payload.update(overrides)
    resp = await client.post("/api/batches", json=payload, headers=headers)
    return resp.json()["id"]


async def test_schedule_h_requires_rx_no(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers, schedule_h=True)
    await _create_batch(client, headers, med_id)

    denied = await client.post(
        "/api/bills", json={"lines": [{"medicine_id": med_id, "qty": 1}], "payment_mode": "cash"}, headers=headers
    )
    assert denied.status_code == 400

    allowed = await client.post(
        "/api/bills",
        json={"lines": [{"medicine_id": med_id, "qty": 1}], "payment_mode": "cash", "rx_no": "RX001"},
        headers=headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["rx_no"] == "RX001"


async def test_bill_doctor_link_and_revenue_analytics(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id)
    doctor = await client.post("/api/doctors", json={"name": "Dr. Test"}, headers=headers)
    doctor_id = doctor.json()["id"]

    bill = await client.post(
        "/api/bills",
        json={"lines": [{"medicine_id": med_id, "qty": 2}], "payment_mode": "cash", "doctor_id": doctor_id},
        headers=headers,
    )
    assert bill.status_code == 200
    assert bill.json()["doctor_id"] == doctor_id

    month = date.today().strftime("%Y-%m")
    revenue = await client.get(f"/api/analytics/doctor-revenue?month={month}", headers=headers)
    assert revenue.status_code == 200
    rows = revenue.json()
    assert any(r["doctor_id"] == doctor_id and r["bill_count"] == 1 for r in rows)


async def test_split_payment_must_sum_to_total(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id)

    mismatched = await client.post(
        "/api/bills",
        json={
            "lines": [{"medicine_id": med_id, "qty": 1}], "payment_mode": "cash",
            "payment_mode_2": "upi", "amount_mode_1": 10, "amount_mode_2": 10,
        },
        headers=headers,
    )
    assert mismatched.status_code == 400

    # 1 unit @ 80, 12% gst -> total 89.6
    correct = await client.post(
        "/api/bills",
        json={
            "lines": [{"medicine_id": med_id, "qty": 1}], "payment_mode": "cash",
            "payment_mode_2": "upi", "amount_mode_1": 50, "amount_mode_2": 39.6,
        },
        headers=headers,
    )
    assert correct.status_code == 200
    assert correct.json()["total"] == 89.6


async def test_customer_ledger_running_balance(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id)
    customer = await client.post("/api/customers", json={"name": "Credit Customer"}, headers=headers)
    customer_id = customer.json()["id"]

    # 3 units @ 80, 12% gst -> total 268.8, on credit
    await client.post(
        "/api/bills",
        json={"lines": [{"medicine_id": med_id, "qty": 3}], "payment_mode": "credit", "customer_id": customer_id},
        headers=headers,
    )
    await client.post("/api/customers/" + customer_id + "/ledger", json={"entry_type": "payment", "amount": 100}, headers=headers)

    ledger = await client.get(f"/api/customers/{customer_id}/ledger", headers=headers)
    assert ledger.status_code == 200
    body = ledger.json()
    assert body["customer"]["outstanding_balance"] == 168.8
    assert body["entries"][-1]["balance_after"] == 168.8


async def test_supplier_ledger_running_balance(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    supplier = await client.post("/api/suppliers", json={"name": "Test Supplier"}, headers=headers)
    supplier_id = supplier.json()["id"]

    await client.post(
        "/api/purchases",
        json={
            "supplier_id": supplier_id,
            "lines": [{"medicine_id": med_id, "batch_no": "B1", "expiry_date": "2030-01-01", "qty": 10, "purchase_price": 40, "selling_price": 80}],
        },
        headers=headers,
    )
    await client.post(f"/api/suppliers/{supplier_id}/payments", json={"amount": 150, "payment_mode": "upi"}, headers=headers)

    ledger = await client.get(f"/api/suppliers/{supplier_id}/payments", headers=headers)
    assert ledger.status_code == 200
    body = ledger.json()
    assert body["supplier"]["outstanding_balance"] == 250.0
    assert [e["type"] for e in body["entries"]] == ["purchase", "payment"]


async def test_reorder_level_drives_low_stock_and_reorder(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers, reorder_level=50)
    await _create_batch(client, headers, med_id, qty=5)

    low_stock = await client.get("/api/reports/low-stock", headers=headers)
    assert any(item["medicine_id"] == med_id for item in low_stock.json())

    reorder = await client.get("/api/reorder/pending", headers=headers)
    line = next(l for l in reorder.json() if l["medicine_id"] == med_id)
    assert line["reorder_level"] == 50
    assert line["suggested_qty"] == 95  # 50*2 - 5


async def test_gstr1_hsn_wise_cgst_sgst_split(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers, hsn_code="30049099", gst_rate=12)
    await _create_batch(client, headers, med_id, qty=5, selling_price=100)

    await client.post(
        "/api/bills", json={"lines": [{"medicine_id": med_id, "qty": 2}], "payment_mode": "cash"}, headers=headers
    )

    month = date.today().strftime("%Y-%m")
    gstr1 = await client.get(f"/api/reports/gstr1?month={month}", headers=headers)
    assert gstr1.status_code == 200
    hsn_line = next(h for h in gstr1.json()["hsn_wise"] if h["hsn_code"] == "30049099")
    assert hsn_line["taxable_value"] == 200.0
    assert hsn_line["total_tax"] == 24.0
    assert hsn_line["cgst"] == 12.0
    assert hsn_line["sgst"] == 12.0


async def test_stats_today_dashboard_fields(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers, gst_rate=0)
    await _create_batch(client, headers, med_id, qty=10, purchase_price=40, selling_price=80)
    customer = await client.post("/api/customers", json={"name": "Dash Customer"}, headers=headers)
    customer_id = customer.json()["id"]

    await client.post(
        "/api/bills",
        json={"lines": [{"medicine_id": med_id, "qty": 2}], "payment_mode": "credit", "customer_id": customer_id},
        headers=headers,
    )

    stats = await client.get("/api/stats/today", headers=headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["total_sales"] == 160.0
    assert body["bill_count"] == 1
    assert body["profit_today"] == 80.0  # revenue 160 - cogs 80
    assert body["pending_credit_count"] == 1
    assert body["pending_credit_amount"] == 160.0
