from httpx import AsyncClient


async def test_change_password_revokes_old_tokens(client: AsyncClient, owner_token: str, owner_credentials: dict):
    headers = {"Authorization": f"Bearer {owner_token}"}
    still_valid = await client.get("/api/auth/me", headers=headers)
    assert still_valid.status_code == 200

    resp = await client.post(
        "/api/auth/change-password",
        json={"current_password": owner_credentials["password"], "new_password": "NewPass@98765"},
        headers=headers,
    )
    assert resp.status_code == 200

    revoked = await client.get("/api/auth/me", headers=headers)
    assert revoked.status_code == 401

    new_login = await client.post(
        "/api/auth/login", data={"username": owner_credentials["email"], "password": "NewPass@98765"}
    )
    assert new_login.status_code == 200
    new_token = new_login.json()["access_token"]
    fresh = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert fresh.status_code == 200
