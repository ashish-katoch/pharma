from httpx import AsyncClient


async def test_health(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_login_success(client: AsyncClient, owner_credentials: dict):
    resp = await client.post(
        "/api/auth/login",
        data={"username": owner_credentials["email"], "password": owner_credentials["password"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "owner"
    assert body["access_token"]


async def test_login_wrong_password_returns_401(client: AsyncClient, owner_credentials: dict):
    resp = await client.post(
        "/api/auth/login",
        data={"username": owner_credentials["email"], "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert "detail" in resp.json()


async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_me_returns_profile(client: AsyncClient, owner_token: str):
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "owner"
