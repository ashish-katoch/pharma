from httpx import AsyncClient


async def test_customer_crud_and_ledger(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post("/api/customers", json={"name": "Alice", "phone": "9999999999"}, headers=headers)
    assert created.status_code == 200
    customer_id = created.json()["id"]
    assert created.json()["loyalty_points"] == 0

    updated = await client.put(f"/api/customers/{customer_id}", json={"address": "12 Main St"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["address"] == "12 Main St"

    ledger = await client.post(
        f"/api/customers/{customer_id}/ledger",
        json={"entry_type": "credit", "amount": 150},
        headers=headers,
    )
    assert ledger.status_code == 200

    listed = await client.get("/api/customers", headers=headers)
    assert any(c["id"] == customer_id for c in listed.json())


async def test_doctor_crud_delete_requires_owner(client: AsyncClient, owner_token: str, staff_token: str):
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    staff_headers = {"Authorization": f"Bearer {staff_token}"}

    created = await client.post(
        "/api/doctors", json={"name": "Dr. Rao", "specialization": "General"}, headers=staff_headers
    )
    assert created.status_code == 200
    doctor_id = created.json()["id"]

    denied = await client.delete(f"/api/doctors/{doctor_id}", headers=staff_headers)
    assert denied.status_code == 403

    deleted = await client.delete(f"/api/doctors/{doctor_id}", headers=owner_headers)
    assert deleted.status_code == 200

    listed = await client.get("/api/doctors", headers=owner_headers)
    assert all(d["id"] != doctor_id for d in listed.json())


async def test_expense_crud(client: AsyncClient, owner_token: str):
    headers = {"Authorization": f"Bearer {owner_token}"}

    created = await client.post(
        "/api/expenses",
        json={"category": "rent", "amount": 5000, "expense_date": "2026-08-01"},
        headers=headers,
    )
    assert created.status_code == 200
    expense_id = created.json()["id"]

    updated = await client.put(
        f"/api/expenses/{expense_id}",
        json={"category": "rent", "amount": 5500, "expense_date": "2026-08-01"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["amount"] == 5500.0

    deleted = await client.delete(f"/api/expenses/{expense_id}", headers=headers)
    assert deleted.status_code == 200

    listed = await client.get("/api/expenses", headers=headers)
    assert all(e["id"] != expense_id for e in listed.json())
