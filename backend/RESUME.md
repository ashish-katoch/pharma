# Resume point — 2026-08-17

Where we left off, so tomorrow picks up exactly here.

## Status: backend is functionally complete and verified

The Mongo→Postgres rewrite is done. All ~28 domains work, 32 automated tests pass,
and everything has been checked live (not just unit tests) against a from-scratch
`docker compose down -v && up --build` — the exact scenario a fresh clone hits.

Both `main` and `development` branches are pushed and in sync at commit `474ac3e`.

## What shipped today

1. **JWT revocation bug fix** — replaced a flaky timestamp comparison with a
   version-counter (`tokens_version`), which was racing on same-second
   password-change + re-login.
2. **Self-service signup** — `POST /api/auth/register` (didn't exist before;
   only way to create an account was a direct DB insert).
3. **P&L accounting bug fix** — `/analytics/pnl` was counting GST as revenue and
   never subtracting COGS. Fixed and verified against hand-calculated numbers.
4. **FK cascade-delete gaps fixed** — several leaf tables (bill_lines,
   purchase_lines, etc.) were missing `ON DELETE CASCADE`, which also surfaced
   a real SQLAlchemy ORM bug (`passive_deletes` alone isn't enough, needs
   `cascade="all, delete-orphan"` too) — found via a crash on deleting a
   journal entry, now fixed everywhere.
5. **Added missing test coverage** — customers, doctors, expenses, journal,
   reports, analytics were previously only smoke-tested by hand.
6. **FastAPI/security audit** — added `response_model` to every route (~130
   new response schemas), added a global per-IP rate limiter (300 req/min)
   with two real concurrency bugs found and fixed along the way (a crash on
   concurrent inserts, and a silent undercounting race that would have let
   the limiter fail to actually block abuse under real load).
7. **Dockerized the whole backend** — `docker-compose.yml` now runs Postgres
   *and* the API together; migrations run automatically on container start.
   See `DOCKER_SETUP.md` for how a frontend dev spins this up from a clean
   clone with just Docker installed.
8. **Closed 8 real gaps found against `BACKEND_SPEC.md`** (the frontend's API
   spec doc) — not naming differences, actual missing capability:
   - Doctor + prescription (Rx) linkage on bills (previously the `Doctor`
     entity had zero connection to billing data)
   - Schedule-H drugs now actually **require** an Rx to sell (400 if missing),
     not just optionally recorded
   - Split payments (two payment modes, validated to sum to bill total)
   - Customer & supplier ledger **read** endpoints (`GET .../ledger`,
     `GET .../payments`) — previously you could only *add* entries, never
     view a statement with running balance
   - Per-medicine `reorder_level` (was one hardcoded threshold for the whole
     shop) — used by `/reports/low-stock` and `/reorder/*`, plus
     `preferred_supplier` suggestion on reorder lines
   - GST HSN-wise CGST/SGST split in `/reports/gstr1` (needed for real
     GSTR-1 filing — was rate-wise only before, no HSN, no tax split)
   - `/stats/today` dashboard expanded from 2 fields to 10 (profit today,
     pending credit, low-stock count, expiring-soon count, week-over-week
     sales comparison)
   - `GET /analytics/doctor-revenue` (real per-doctor bill_count + revenue,
     only possible once bills link to doctors)

## What's explicitly deferred — pick up here tomorrow

Two items from `BACKEND_SPEC.md` were scoped out of today's session because
they're **design decisions**, not quick additions:

### 1. Notification engine
`BACKEND_SPEC.md` describes `GET/PUT /notification-settings` with
`low_stock_alert`, `expiry_alert_days`, `eod_reminder`/`eod_reminder_time`,
and a `push_token`. Today, only push-token *storage* exists
(`POST/GET /push/register`) — nothing ever triggers a push. Before building
this, need to decide:
- What actually sends the push (a scheduled job? triggered on each relevant
  write, e.g. a batch going low-stock?)
- Whether that's a background worker process, a cron-triggered endpoint, or
  something else — this app has no job runner today
- Which push provider (Expo push service, given the app is Expo-based, is
  the obvious default — `pharma-app` already uses `expo-notifications`
  patterns per its dependencies)

### 2. Plan-based feature gating
`BACKEND_SPEC.md`'s idea: `free` plan has `analytics: false`, paid plans
unlock more. Today `/plan/upgrade` just flips a string on `Organization` —
nothing anywhere actually checks "is this plan allowed to hit this route"
before serving a response. Before building this, need to decide:
- Which specific routes/features are actually meant to be gated (the spec
  lists `multi_shop`, `analytics`, `reports` as examples — is that the real
  list, or does the business want something else?)
- What the enforcement mechanism looks like — a FastAPI dependency
  (`Depends(require_plan("pro"))`) is the natural fit given the existing
  `require_owner` pattern in `security.py`
- Whether this connects to the existing Razorpay payment integration
  (`payments.py`) to actually gate on a *paid* subscription, not just an
  owner-settable string

## Known non-issues (don't re-investigate these)

- `owner@pharma.com` seed-looking account in dev DB — confirmed harmless,
  manually created in an earlier session for smoke-testing, no trace in any
  seed script or startup code.
- OCR invoice scan (`/purchases/scan`) is a stub — explicitly deferred by
  user preference, not a bug.
- `docker compose down -v` wipes the dev DB clean — this is expected/fine,
  it's disposable local dev data, not anything real.

## How to resume locally

```bash
cd /Users/harwindersingh/Pharma/pharma-backend
docker compose up -d --build   # Postgres + API, migrations run automatically
source .venv/bin/activate      # if you want to run pytest outside Docker
pytest tests/ -v
```

Frontend dev on another machine: see `DOCKER_SETUP.md` — clone, `cp .env.example .env`
(set `JWT_SECRET`), `docker compose up -d --build`, done.

`pharma-app` (Expo) needs `EXPO_PUBLIC_BACKEND_URL` in its own `.env` pointing at
this backend — `http://localhost:8000` for simulator/web, or your machine's LAN
IP (`ipconfig getifaddr en0`) for a physical device.
