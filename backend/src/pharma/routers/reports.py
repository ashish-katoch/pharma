import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.database import get_db
from pharma.models.batch import Batch
from pharma.models.bill import Bill, BillLine
from pharma.models.medicine import Medicine
from pharma.models.misc import Doctor
from pharma.schemas.reports import ExpiringBatchOut, GstSummaryOut, Gstr1Out, LowStockItemOut, ScheduleHSaleOut
from pharma.security import get_current_shop

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/low-stock", response_model=list[LowStockItemOut])
async def low_stock(
    threshold: int | None = Query(default=None, description="Overrides each medicine's own reorder_level if set"),
    shop_id: uuid.UUID = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Medicine.id, Medicine.name, Medicine.reorder_level, func.coalesce(func.sum(Batch.qty), 0).label("stock"))
        .outerjoin(Batch, (Batch.medicine_id == Medicine.id) & (Batch.shop_id == shop_id))
        .where(Medicine.shop_id == shop_id)
        .group_by(Medicine.id, Medicine.name, Medicine.reorder_level)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"medicine_id": str(mid), "name": name, "stock": int(stock)}
        for mid, name, reorder_level, stock in rows
        if int(stock) <= (threshold if threshold is not None else reorder_level)
    ]


@router.get("/expiring", response_model=list[ExpiringBatchOut])
async def expiring(window: int = Query(default=90, le=365), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    cutoff = date.today() + timedelta(days=window)
    stmt = (
        select(Batch, Medicine.name)
        .join(Medicine, Medicine.id == Batch.medicine_id)
        .where(Batch.shop_id == shop_id, Batch.qty > 0, Batch.expiry_date <= cutoff)
        .order_by(Batch.expiry_date)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"batch_id": str(b.id), "medicine_name": name, "expiry_date": b.expiry_date.isoformat(), "qty": b.qty}
        for b, name in rows
    ]


async def _month_bounds(month: str) -> tuple[int, int]:
    year, mon = month.split("-")
    return int(year), int(mon)


@router.get("/gst-summary", response_model=GstSummaryOut)
async def gst_summary(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = await _month_bounds(month)
    stmt = (
        select(func.coalesce(func.sum(Bill.subtotal), 0), func.coalesce(func.sum(Bill.gst_amount), 0), func.coalesce(func.sum(Bill.total), 0))
        .where(Bill.shop_id == shop_id, Bill.status == "active", extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon)
    )
    subtotal, gst, total = (await db.execute(stmt)).one()
    return {"month": month, "taxable_value": float(subtotal), "gst_collected": float(gst), "total_sales": float(total)}


@router.get("/gstr1", response_model=Gstr1Out)
async def gstr1(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = await _month_bounds(month)
    filters = (
        Bill.shop_id == shop_id, Bill.status == "active",
        extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon,
    )

    rate_stmt = (
        select(BillLine.gst_rate, func.coalesce(func.sum(BillLine.line_total), 0))
        .join(Bill, Bill.id == BillLine.bill_id)
        .where(*filters)
        .group_by(BillLine.gst_rate)
    )
    rate_rows = (await db.execute(rate_stmt)).all()

    # HSN-wise summary with CGST/SGST split, as needed for GSTR-1 filing.
    # Assumes intra-state sales (CGST+SGST, split evenly) since this is a
    # walk-in pharmacy counter — there is no inter-state B2B/IGST path to
    # detect a customer's billing state from, so that split isn't modeled.
    hsn_stmt = (
        select(
            Medicine.hsn_code, BillLine.gst_rate,
            func.coalesce(func.sum(BillLine.line_total), 0),
            func.count(func.distinct(Bill.id)),
        )
        .join(Bill, Bill.id == BillLine.bill_id)
        .join(Medicine, Medicine.id == BillLine.medicine_id)
        .where(*filters)
        .group_by(Medicine.hsn_code, BillLine.gst_rate)
    )
    hsn_rows = (await db.execute(hsn_stmt)).all()

    hsn_wise = []
    for hsn_code, rate, taxable, invoice_count in hsn_rows:
        total_tax = round(float(taxable) * float(rate) / 100, 2)
        half = round(total_tax / 2, 2)
        hsn_wise.append(
            {
                "hsn_code": hsn_code,
                "gst_rate": float(rate),
                "taxable_value": float(taxable),
                "cgst": half,
                "sgst": total_tax - half,
                "total_tax": total_tax,
                "invoice_count": int(invoice_count),
            }
        )

    return {
        "month": month,
        "rate_wise": [{"gst_rate": float(rate), "taxable_value": float(val)} for rate, val in rate_rows],
        "hsn_wise": hsn_wise,
    }


@router.get("/schedule-h", response_model=list[ScheduleHSaleOut])
async def schedule_h(month: str = Query(), shop_id: uuid.UUID = Depends(get_current_shop), db: AsyncSession = Depends(get_db)):
    year, mon = await _month_bounds(month)
    stmt = (
        select(Bill.id, Bill.bill_no, Bill.created_at, Medicine.name, Bill.rx_no, Doctor.name, Bill.diagnosis, BillLine.qty)
        .join(BillLine, BillLine.bill_id == Bill.id)
        .join(Medicine, Medicine.id == BillLine.medicine_id)
        .outerjoin(Doctor, Doctor.id == Bill.doctor_id)
        .where(
            Bill.shop_id == shop_id, Bill.status == "active", Medicine.schedule_h.is_(True),
            extract("year", Bill.created_at) == year, extract("month", Bill.created_at) == mon,
        )
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "bill_id": str(bid), "bill_no": no, "date": dt.isoformat(), "medicine_name": name,
            "rx_no": rx_no, "doctor_name": doctor_name, "diagnosis": diagnosis, "quantity": qty,
        }
        for bid, no, dt, name, rx_no, doctor_name, diagnosis, qty in rows
    ]
