import os
import uuid

# Must be set before any `pharma` module import — settings are read once at
# import time (pharma.database, pharma.main) and cached, so setting this any
# later has no effect. Disables the global per-IP rate limiter for tests,
# which otherwise shares its Postgres-backed counter with the dev server —
# without this, running the suite while manually testing against a live
# server (or just running the suite twice back to back) can trip the same
# limiter and make tests fail with 429s that have nothing to do with the
# test itself.
os.environ["TESTING"] = "true"

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import SessionLocal, engine
from pharma.main import app
from pharma.models.organization import Organization
from pharma.models.shop import Shop
from pharma.models.user import User
from pharma.models.user_shop import UserShop
from pharma.security import hash_password


@pytest.fixture(autouse=True)
async def _dispose_engine_per_test():
    """pytest-asyncio gives each test its own event loop, but the engine's
    connection pool is bound to whichever loop created it — reusing it across
    tests raises 'Event loop is closed'. Disposing after each test forces a
    fresh pool bound to the next test's loop."""
    yield
    await engine.dispose()


@pytest.fixture
async def db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def owner_credentials(db: AsyncSession):
    email = f"owner-{uuid.uuid4().hex[:8]}@test.com"
    password = "TestPass@12345"

    org = Organization(name="Test Org")
    db.add(org)
    await db.flush()
    shop = Shop(organization_id=org.id, name="Test Shop")
    db.add(shop)
    await db.flush()
    user = User(email=email, name="Test Owner", hashed_password=hash_password(password))
    db.add(user)
    await db.flush()
    db.add(UserShop(user_id=user.id, shop_id=shop.id, role="owner"))
    await db.commit()

    yield {"email": email, "password": password, "shop_id": str(shop.id)}

    # Deleting the org cascades to shop/user_shop, but users aren't FK'd to
    # a shop (multi-tenant is via the join table) so they — and any staff
    # created under them by the staff_token fixture — would otherwise pile
    # up across every test run indefinitely. Best-effort: most shop-scoped
    # tables (medicines, bills, batches...) aren't ON DELETE CASCADE from
    # shops, so tests that created business data leave their shop behind
    # rather than fail teardown on a FK violation.
    async with SessionLocal() as cleanup_db:
        try:
            staff_stmt = (
                select(User)
                .join(UserShop, UserShop.user_id == User.id)
                .where(UserShop.shop_id == shop.id, User.id != user.id)
            )
            for staff_user in (await cleanup_db.execute(staff_stmt)).scalars().all():
                await cleanup_db.delete(staff_user)
            await cleanup_db.delete(await cleanup_db.get(User, user.id))
            await cleanup_db.execute(delete(Organization).where(Organization.id == org.id))
            await cleanup_db.commit()
        except Exception:
            await cleanup_db.rollback()


@pytest.fixture
async def owner_token(client: AsyncClient, owner_credentials: dict) -> str:
    resp = await client.post(
        "/api/auth/login",
        data={"username": owner_credentials["email"], "password": owner_credentials["password"]},
    )
    return resp.json()["access_token"]


@pytest.fixture
async def staff_token(client: AsyncClient, owner_token: str) -> str:
    email = f"staff-{uuid.uuid4().hex[:8]}@test.com"
    password = "StaffPass@12345"
    await client.post(
        "/api/auth/staff",
        json={"email": email, "name": "Test Staff", "password": password, "role": "staff"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    resp = await client.post("/api/auth/login", data={"username": email, "password": password})
    return resp.json()["access_token"]
