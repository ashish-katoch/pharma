from httpx import AsyncClient


async def _create_medicine(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/medicines", json={"name": "Test Med", "gst_rate": 12, "mrp": 20}, headers=headers)
    return resp.json()["id"]


async def _create_batch(client: AsyncClient, headers: dict, medicine_id: str, batch_no: str, expiry: str, qty: int) -> str:
    resp = await client.post(
        "/api/batches",
        json={
            "medicine_id": medicine_id,
            "batch_no": batch_no,
            "expiry_date": expiry,
            "qty": qty,
            "purchase_price": 10,
            "selling_price": 15,
        },
        headers=headers,
    )
    return resp.json()["id"]


async def test_bill_fefo_pick_spans_batches(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id, "B1", "2026-12-01", 10)
    await _create_batch(client, headers, med_id, "B2", "2027-06-01", 10)

    resp = await client.post(
        "/api/bills",
        json={"payment_mode": "cash", "lines": [{"medicine_id": med_id, "qty": 15}]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["lines"]) == 2  # spans both batches
    assert body["lines"][0]["qty"] == 10  # earlier-expiry batch fully consumed first

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 5


async def test_bill_idempotent_on_client_request_id(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id, "B1", "2026-12-01", 10)

    payload = {"payment_mode": "cash", "client_request_id": "dup-1", "lines": [{"medicine_id": med_id, "qty": 3}]}
    first = await client.post("/api/bills", json=payload, headers=headers)
    second = await client.post("/api/bills", json=payload, headers=headers)

    assert first.json()["id"] == second.json()["id"]
    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 7  # decremented once, not twice


async def test_bill_insufficient_stock_returns_409(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id, "B1", "2026-12-01", 5)

    resp = await client.post(
        "/api/bills",
        json={"payment_mode": "cash", "lines": [{"medicine_id": med_id, "qty": 50}]},
        headers=headers,
    )
    assert resp.status_code == 409

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 5  # unchanged — no partial deduction on failure
