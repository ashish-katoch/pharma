import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from pharma.config import get_settings
from pharma.database import SessionLocal
from pharma.exceptions import register_exception_handlers
from pharma.services.rate_limit import RateLimitedError, check_and_record_global_rate
from pharma.routers import (
    adjustments,
    admin,
    analytics,
    audit_log,
    auth,
    batches,
    bills,
    customers,
    doctors,
    eod,
    expenses,
    journal,
    ledger,
    medicines,
    payments,
    plan,
    purchases,
    reorder,
    reports,
    shifts,
    shop,
    stats,
    supplier_returns,
    suppliers,
    sync,
    uploads,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("pharma")


def create_app() -> FastAPI:
    settings = get_settings()

    if settings.is_production and not settings.cors_origin_list:
        raise RuntimeError("CORS_ORIGINS must be set explicitly when ENV=production")

    app = FastAPI(title="Pharma Counter API")

    origins = settings.cors_origin_list
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=bool(origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.middleware("http")
    async def global_rate_limit(request: Request, call_next):
        if not settings.testing and request.url.path.startswith("/api") and request.url.path != "/api/health":
            # Uses the raw socket IP, consistent with the login/register limiters
            # in rate_limit.py — deliberately does not trust X-Forwarded-For,
            # which any client can spoof unless a trusted reverse proxy strips
            # and re-sets it first. If this deploys behind a proxy/LB, configure
            # it at the ASGI server level (e.g. uvicorn --proxy-headers with a
            # --forwarded-allow-ips allowlist) rather than trusting it here.
            ip = request.client.host if request.client else "unknown"
            async with SessionLocal() as db:
                try:
                    await check_and_record_global_rate(db, ip)
                except RateLimitedError as exc:
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)

    api = APIRouter(prefix="/api")
    for router in (
        auth.router,
        shop.router,
        medicines.router,
        batches.router,
        bills.router,
        customers.router,
        suppliers.router,
        purchases.router,
        adjustments.router,
        doctors.router,
        expenses.router,
        journal.router,
        shifts.router,
        eod.router,
        supplier_returns.router,
        payments.router,
        sync.router,
        reports.router,
        analytics.router,
        stats.router,
        ledger.router,
        audit_log.router,
        admin.router,
        plan.router,
        reorder.router,
        uploads.router,
    ):
        api.include_router(router)

    @api.get("/health")
    async def health():
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
