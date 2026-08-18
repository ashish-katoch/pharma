from httpx import AsyncClient


async def _create_medicine(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/medicines", json={"name": "Test Med", "gst_rate": 12, "mrp": 20}, headers=headers)
    return resp.json()["id"]


async def _create_batch(client: AsyncClient, headers: dict, medicine_id: str, batch_no: str, expiry: str, qty: int) -> str:
    resp = await client.post(
        "/api/batches",
        json={"medicine_id": medicine_id, "batch_no": batch_no, "expiry_date": expiry, "qty": qty, "purchase_price": 10, "selling_price": 15},
        headers=headers,
    )
    return resp.json()["id"]


async def test_owner_edit_applies_immediately_and_versions(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id, "B1", "2026-12-01", 10)

    bill = (await client.post("/api/bills", json={"payment_mode": "cash", "lines": [{"medicine_id": med_id, "qty": 3}]}, headers=headers)).json()
    bill_id = bill["id"]

    edit_resp = await client.put(
        f"/api/bills/{bill_id}",
        json={"discount": 0, "reason": "customer changed mind on qty", "lines": [{"medicine_id": med_id, "qty": 1}]},
        headers=headers,
    )
    assert edit_resp.status_code == 200
    edited = edit_resp.json()
    assert len(edited["lines"]) == 1
    assert edited["lines"][0]["qty"] == 1

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 9  # 10 - 1 (net of reversal + re-pick)

    versions = (await client.get(f"/api/bills/{bill_id}/versions", headers=headers)).json()
    assert len(versions) == 1
    assert versions[0]["snapshot"]["lines"][0]["qty"] == 3  # pre-edit snapshot


async def test_staff_edit_requires_owner_approval(client: AsyncClient, owner_token: str, staff_token: str):
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    med_id = await _create_medicine(client, owner_headers)
    await _create_batch(client, owner_headers, med_id, "B1", "2026-12-01", 10)

    bill = (await client.post("/api/bills", json={"payment_mode": "cash", "lines": [{"medicine_id": med_id, "qty": 3}]}, headers=owner_headers)).json()
    bill_id = bill["id"]

    staff_edit = await client.put(
        f"/api/bills/{bill_id}",
        json={"discount": 0, "reason": "wrong qty entered", "lines": [{"medicine_id": med_id, "qty": 1}]},
        headers=staff_headers,
    )
    assert staff_edit.status_code == 200
    assert len(staff_edit.json()["lines"]) == 1
    assert staff_edit.json()["lines"][0]["qty"] == 3  # unchanged — staff edit is only staged

    med_before_approval = (await client.get(f"/api/medicines/{med_id}", headers=owner_headers)).json()
    assert med_before_approval["stock_qty"] == 7  # unaffected by the staged edit

    approve = await client.post(f"/api/bills/{bill_id}/approve-edit", headers=owner_headers)
    assert approve.status_code == 200
    assert approve.json()["lines"][0]["qty"] == 1

    med_after = (await client.get(f"/api/medicines/{med_id}", headers=owner_headers)).json()
    assert med_after["stock_qty"] == 9


async def test_return_restocks_and_caps_at_billed_qty(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}
    med_id = await _create_medicine(client, headers)
    await _create_batch(client, headers, med_id, "B1", "2026-12-01", 10)

    bill = (await client.post("/api/bills", json={"payment_mode": "cash", "lines": [{"medicine_id": med_id, "qty": 5}]}, headers=headers)).json()
    bill_line_id = bill["lines"][0]["id"]

    ret = await client.post(f"/api/bills/{bill['id']}/return", json={"lines": [{"bill_line_id": bill_line_id, "qty": 2}]}, headers=headers)
    assert ret.status_code == 200
    assert ret.json()["total"] == 30.0  # 2 * 15

    med = (await client.get(f"/api/medicines/{med_id}", headers=headers)).json()
    assert med["stock_qty"] == 7  # 10 - 5 + 2

    over_return = await client.post(f"/api/bills/{bill['id']}/return", json={"lines": [{"bill_line_id": bill_line_id, "qty": 10}]}, headers=headers)
    assert over_return.status_code == 400
