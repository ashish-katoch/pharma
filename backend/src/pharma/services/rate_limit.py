from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.exceptions import DomainError
from pharma.models.transient_state import TransientState

_LOGIN_WINDOW = timedelta(minutes=15)
_LOGIN_MAX_FAILS = 10

_REGISTER_WINDOW = timedelta(hours=1)
_REGISTER_MAX = 5

_GLOBAL_WINDOW = timedelta(minutes=1)
_GLOBAL_MAX = 300


class RateLimitedError(DomainError):
    status_code = 429


async def _check_and_increment_counter(db: AsyncSession, key: str, window: timedelta, max_count: int) -> None:
    """Shared fixed-window counter backing every limiter in this module.

    A plain read-then-write races under real concurrency: two requests can
    both read count=N and both write N+1, silently losing an increment (an
    undercounting limiter fails to actually block abuse), or both see "no
    row" and both try to INSERT the same key, crashing with IntegrityError.
    Locks the row for the duration of the update (SELECT ... FOR UPDATE) to
    serialize concurrent hits on the same key instead of racing.
    """
    now = datetime.now(timezone.utc)
    stmt = select(TransientState).where(TransientState.key == key).with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()

    if row is None:
        try:
            async with db.begin_nested():
                db.add(TransientState(key=key, value={"count": 1}, expires_at=now + window))
            await db.commit()
        except IntegrityError:
            # Lost the race to a concurrent request that inserted this key first.
            await db.rollback()
            row = (await db.execute(stmt)).scalar_one_or_none()
            if row:
                row.value = {"count": row.value.get("count", 0) + 1}
                await db.commit()
        return

    active = row.expires_at > now
    count = row.value.get("count", 0) if active else 0
    if count >= max_count:
        await db.rollback()  # release the row lock without counting this request
        raise RateLimitedError("Too many requests — try again later")

    row.value = {"count": count + 1}
    if not active:
        row.expires_at = now + window
    await db.commit()


async def check_login_rate(db: AsyncSession, ip: str) -> None:
    key = f"login_fail:{ip}"
    row = await db.get(TransientState, key)
    now = datetime.now(timezone.utc)
    fails = (row.value.get("count", 0) if row and row.expires_at > now else 0)
    if fails >= _LOGIN_MAX_FAILS:
        raise RateLimitedError("Too many failed login attempts — try again later")


async def record_login_failure(db: AsyncSession, ip: str) -> None:
    # Recording a failure should never itself raise — check_login_rate (called
    # separately, before the auth attempt) is what actually blocks; this just
    # tracks the count, so pass an effectively unbounded cap.
    await _check_and_increment_counter(db, f"login_fail:{ip}", _LOGIN_WINDOW, max_count=10**9)


async def clear_login_failures(db: AsyncSession, ip: str) -> None:
    await db.execute(delete(TransientState).where(TransientState.key == f"login_fail:{ip}"))
    await db.commit()


async def check_and_record_register_rate(db: AsyncSession, ip: str) -> None:
    try:
        await _check_and_increment_counter(db, f"register:{ip}", _REGISTER_WINDOW, _REGISTER_MAX)
    except RateLimitedError:
        raise RateLimitedError("Too many signups from this address — try again later")


async def check_and_record_global_rate(db: AsyncSession, ip: str) -> None:
    await _check_and_increment_counter(db, f"global:{ip}", _GLOBAL_WINDOW, _GLOBAL_MAX)
