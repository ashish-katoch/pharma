from httpx import AsyncClient


async def _create_medicine(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/medicines", json={"name": "Test Med", "gst_rate": 12, "mrp": 20}, headers=headers)
    return resp.json()["id"]


async def _create_supplier(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/suppliers", json={"name": "Test Supplier"}, headers=headers)
    return resp.json()["id"]


async def test_purchase_adds_stock(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    sup_id = await _create_supplier(client, headers)

    resp = await client.post(
        "/api/purchases",
        json={
            "supplier_id": sup_id,
            "lines": [{"medicine_id": med_id, "batch_no": "B1", "expiry_date": "2027-01-01", "qty": 20, "purchase_price": 8, "selling_price": 12}],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 160.0

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 20


async def test_purchase_requires_owner(client: AsyncClient, owner_token: str, staff_token: str):
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    med_id = await _create_medicine(client, owner_headers)
    sup_id = await _create_supplier(client, owner_headers)

    resp = await client.post(
        "/api/purchases",
        json={"supplier_id": sup_id, "lines": [{"medicine_id": med_id, "batch_no": "B1", "expiry_date": "2027-01-01", "qty": 5, "purchase_price": 8, "selling_price": 12}]},
        headers=staff_headers,
    )
    assert resp.status_code == 403


async def test_adjustment_cannot_go_negative(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    batch_resp = await client.post(
        "/api/batches",
        json={"medicine_id": med_id, "batch_no": "B1", "expiry_date": "2027-01-01", "qty": 5, "purchase_price": 8, "selling_price": 12},
        headers=headers,
    )
    batch_id = batch_resp.json()["id"]

    ok = await client.post("/api/adjustments", json={"batch_id": batch_id, "qty_delta": -3, "reason": "damaged"}, headers=headers)
    assert ok.status_code == 200

    over = await client.post("/api/adjustments", json={"batch_id": batch_id, "qty_delta": -10, "reason": "damaged"}, headers=headers)
    assert over.status_code == 409

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 2


async def test_supplier_payment_requires_owner(client: AsyncClient, owner_token: str, staff_token: str):
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    sup_id = await _create_supplier(client, owner_headers)

    denied = await client.post(f"/api/suppliers/{sup_id}/payments", json={"amount": 100, "payment_mode": "cash"}, headers=staff_headers)
    assert denied.status_code == 403

    allowed = await client.post(f"/api/suppliers/{sup_id}/payments", json={"amount": 100, "payment_mode": "cash"}, headers=owner_headers)
    assert allowed.status_code == 200
