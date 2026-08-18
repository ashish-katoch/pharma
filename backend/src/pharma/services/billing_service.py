import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.exceptions import DomainError, InsufficientStockError, NotFoundError
from pharma.models.batch import Batch
from pharma.models.bill import Bill, BillLine, StockLedgerEntry
from pharma.models.bill_version import BillVersion, Return, ReturnLine
from pharma.models.counter import Counter
from pharma.models.customer import CreditLedgerEntry, Customer
from pharma.models.medicine import Medicine
from pharma.models.misc import Doctor
from pharma.models.transient_state import TransientState
from pharma.schemas.bill import BillCreateIn, BillEditIn, BillLineIn, ReturnCreateIn

_EDIT_APPROVAL_TTL_SECONDS = 3600


async def _next_bill_no(db: AsyncSession, shop_id: uuid.UUID) -> str:
    stmt = select(Counter).where(Counter.shop_id == shop_id, Counter.name == "bill_no").with_for_update()
    counter = (await db.execute(stmt)).scalar_one_or_none()
    if counter is None:
        counter = Counter(shop_id=shop_id, name="bill_no", value=0)
        db.add(counter)
        await db.flush()
    counter.value += 1
    return f"INV-{counter.value:06d}"


async def _fefo_pick_and_price(
    db: AsyncSession, shop_id: uuid.UUID, lines: list[BillLineIn], rx_no: str | None = None
) -> tuple[list[BillLine], list[tuple[uuid.UUID, int]], float, float]:
    """Shared FEFO stock-pick + GST pricing logic used by both bill creation
    and bill editing, so the math lives in exactly one place."""
    subtotal = 0.0
    gst_amount = 0.0
    bill_lines: list[BillLine] = []
    stock_moves: list[tuple[uuid.UUID, int]] = []

    for line in lines:
        medicine = await db.get(Medicine, line.medicine_id)
        if not medicine or medicine.shop_id != shop_id:
            raise NotFoundError(f"Medicine {line.medicine_id} not found")
        if medicine.schedule_h and not rx_no:
            raise DomainError(f"{medicine.name} is a Schedule H drug — a prescription number (rx_no) is required")

        remaining = line.qty
        batch_stmt = (
            select(Batch)
            .where(Batch.shop_id == shop_id, Batch.medicine_id == line.medicine_id, Batch.qty > 0)
            .order_by(Batch.expiry_date)
            .with_for_update()
        )
        batches = (await db.execute(batch_stmt)).scalars().all()

        for batch in batches:
            if remaining <= 0:
                break
            take = min(remaining, batch.qty)
            batch.qty -= take
            remaining -= take

            line_total = round(take * float(batch.selling_price), 2)
            gst_for_line = round(line_total * float(medicine.gst_rate) / 100, 2)
            subtotal += line_total
            gst_amount += gst_for_line

            bill_lines.append(
                BillLine(
                    batch_id=batch.id,
                    medicine_id=medicine.id,
                    qty=take,
                    unit_price=batch.selling_price,
                    gst_rate=medicine.gst_rate,
                    line_total=line_total,
                )
            )
            stock_moves.append((batch.id, take))

        if remaining > 0:
            raise InsufficientStockError(f"Insufficient stock for medicine {line.medicine_id}: short by {remaining}")

    return bill_lines, stock_moves, subtotal, gst_amount


async def create_bill(db: AsyncSession, shop_id: uuid.UUID, user_id: uuid.UUID, payload: BillCreateIn) -> Bill:
    """Creates a bill, decrements stock via FEFO pick, and records the stock
    ledger — all in one DB transaction (single commit). A crash at any point
    before commit leaves no partial state: either the whole sale is recorded,
    or none of it is. Batch rows are locked (FOR UPDATE) during the FEFO pick
    to prevent a race between two concurrent sales overselling the same batch.
    """
    if payload.client_request_id:
        existing_stmt = select(Bill).where(Bill.shop_id == shop_id, Bill.client_request_id == payload.client_request_id)
        existing = (await db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            await db.refresh(existing, attribute_names=["lines"])
            return existing

    bill_lines, stock_moves, subtotal, gst_amount = await _fefo_pick_and_price(db, shop_id, payload.lines, payload.rx_no)

    discount = round(payload.discount, 2)
    total = round(subtotal + gst_amount - discount, 2)

    if payload.payment_mode_2:
        if payload.amount_mode_1 is None or payload.amount_mode_2 is None:
            raise DomainError("amount_mode_1 and amount_mode_2 are required for split payment")
        if round(payload.amount_mode_1 + payload.amount_mode_2, 2) != total:
            raise DomainError("amount_mode_1 + amount_mode_2 must equal the bill total")

    if payload.doctor_id:
        doctor = await db.get(Doctor, payload.doctor_id)
        if not doctor or doctor.shop_id != shop_id:
            raise NotFoundError("Doctor not found")

    bill_no = await _next_bill_no(db, shop_id)
    bill = Bill(
        shop_id=shop_id,
        bill_no=bill_no,
        customer_id=payload.customer_id,
        doctor_id=payload.doctor_id,
        rx_no=payload.rx_no,
        diagnosis=payload.diagnosis,
        created_by_user_id=user_id,
        subtotal=round(subtotal, 2),
        discount=discount,
        gst_amount=round(gst_amount, 2),
        total=total,
        payment_mode=payload.payment_mode,
        payment_mode_2=payload.payment_mode_2,
        amount_mode_1=payload.amount_mode_1,
        amount_mode_2=payload.amount_mode_2,
        status="active",
        client_request_id=payload.client_request_id,
    )
    db.add(bill)
    await db.flush()

    for bill_line in bill_lines:
        bill_line.bill_id = bill.id
        db.add(bill_line)

    for batch_id, qty_taken in stock_moves:
        db.add(
            StockLedgerEntry(
                shop_id=shop_id, batch_id=batch_id, movement_type="sale", qty_delta=-qty_taken,
                reference_type="bill", reference_id=str(bill.id),
            )
        )

    if payload.payment_mode == "credit":
        if not payload.customer_id:
            raise NotFoundError("Customer required for credit payment mode")
        customer = await db.get(Customer, payload.customer_id)
        if not customer or customer.shop_id != shop_id:
            raise NotFoundError("Customer not found")
        db.add(
            CreditLedgerEntry(
                shop_id=shop_id, customer_id=customer.id, entry_type="credit", amount=total,
                bill_id=bill.id, notes=f"Bill {bill.bill_no}",
            )
        )

    await db.commit()
    await db.refresh(bill, attribute_names=["lines"])
    return bill


def _snapshot_bill(bill: Bill) -> dict:
    return {
        "bill_no": bill.bill_no,
        "subtotal": float(bill.subtotal),
        "discount": float(bill.discount),
        "gst_amount": float(bill.gst_amount),
        "total": float(bill.total),
        "payment_mode": bill.payment_mode,
        "lines": [
            {
                "medicine_id": str(bl.medicine_id),
                "batch_id": str(bl.batch_id),
                "qty": bl.qty,
                "unit_price": float(bl.unit_price),
                "gst_rate": float(bl.gst_rate),
                "line_total": float(bl.line_total),
            }
            for bl in bill.lines
        ],
    }


async def _apply_edit(db: AsyncSession, bill: Bill, editor_email: str, payload: BillEditIn) -> Bill:
    await db.refresh(bill, attribute_names=["lines"])
    db.add(BillVersion(bill_id=bill.id, edited_by_email=editor_email, snapshot=_snapshot_bill(bill)))

    # Reverse original stock movements (restock what this bill had taken).
    for old_line in bill.lines:
        batch = await db.get(Batch, old_line.batch_id, with_for_update=True)
        if batch:
            batch.qty += old_line.qty
            db.add(
                StockLedgerEntry(
                    shop_id=bill.shop_id, batch_id=batch.id, movement_type="sale", qty_delta=old_line.qty,
                    reference_type="bill_edit_reversal", reference_id=str(bill.id),
                )
            )
        await db.delete(old_line)
    await db.flush()

    bill_lines, stock_moves, subtotal, gst_amount = await _fefo_pick_and_price(db, bill.shop_id, payload.lines, bill.rx_no)
    discount = round(payload.discount, 2)
    total = round(subtotal + gst_amount - discount, 2)

    bill.subtotal = round(subtotal, 2)
    bill.discount = discount
    bill.gst_amount = round(gst_amount, 2)
    bill.total = total

    for bill_line in bill_lines:
        bill_line.bill_id = bill.id
        db.add(bill_line)
    for batch_id, qty_taken in stock_moves:
        db.add(
            StockLedgerEntry(
                shop_id=bill.shop_id, batch_id=batch_id, movement_type="sale", qty_delta=-qty_taken,
                reference_type="bill_edit", reference_id=str(bill.id),
            )
        )

    await db.commit()
    await db.refresh(bill, attribute_names=["lines"])
    return bill


async def edit_bill(
    db: AsyncSession, shop_id: uuid.UUID, bill_id: uuid.UUID, editor_email: str, is_owner: bool, payload: BillEditIn
) -> tuple[Bill, bool]:
    """Owners apply an edit immediately. Staff edits are staged and require
    owner approval via approve_edit() — mirrors the original bill-edit
    approval workflow, now backed by a Postgres table instead of an
    in-memory dict that reset on restart.

    Returns (bill, applied) — applied=False means the edit is pending approval
    and the bill is returned unchanged.
    """
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    if bill.status != "active":
        raise DomainError("Only active bills can be edited")

    if not is_owner:
        now = datetime.now(timezone.utc)
        db.add(
            TransientState(
                key=f"bill_edit_pending:{bill_id}",
                value={
                    "requested_by": editor_email,
                    "discount": payload.discount,
                    "reason": payload.reason,
                    "lines": [line.model_dump(mode="json") for line in payload.lines],
                },
                expires_at=now + timedelta(seconds=_EDIT_APPROVAL_TTL_SECONDS),
            )
        )
        await db.commit()
        await db.refresh(bill, attribute_names=["lines"])
        return bill, False

    bill = await _apply_edit(db, bill, editor_email, payload)
    return bill, True


async def approve_edit(db: AsyncSession, shop_id: uuid.UUID, bill_id: uuid.UUID, approver_email: str) -> Bill:
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")

    key = f"bill_edit_pending:{bill_id}"
    pending = await db.get(TransientState, key)
    now = datetime.now(timezone.utc)
    if not pending or pending.expires_at < now:
        raise NotFoundError("No pending edit for this bill")

    payload = BillEditIn(
        discount=pending.value["discount"],
        lines=[BillLineIn(**line) for line in pending.value["lines"]],
        reason=pending.value["reason"],
    )
    bill = await _apply_edit(db, bill, approver_email, payload)
    await db.delete(pending)
    await db.commit()
    return bill


async def create_return(
    db: AsyncSession, shop_id: uuid.UUID, bill_id: uuid.UUID, payload: ReturnCreateIn
) -> Return:
    bill = await db.get(Bill, bill_id)
    if not bill or bill.shop_id != shop_id:
        raise NotFoundError("Bill not found")
    await db.refresh(bill, attribute_names=["lines"])
    lines_by_id = {bl.id: bl for bl in bill.lines}

    total_refund = 0.0
    ret = Return(shop_id=shop_id, bill_id=bill_id, total=0)
    db.add(ret)
    await db.flush()

    for line in payload.lines:
        bill_line = lines_by_id.get(line.bill_line_id)
        if not bill_line:
            raise NotFoundError(f"Bill line {line.bill_line_id} not found on this bill")
        available = bill_line.qty - bill_line.returned_qty
        if line.qty > available:
            raise DomainError(f"Cannot return {line.qty} — only {available} returnable on this line")

        bill_line.returned_qty += line.qty
        refund = round(float(bill_line.unit_price) * line.qty, 2)
        total_refund += refund

        batch = await db.get(Batch, bill_line.batch_id, with_for_update=True)
        if batch:
            batch.qty += line.qty

        db.add(ReturnLine(return_id=ret.id, bill_line_id=bill_line.id, batch_id=bill_line.batch_id, qty=line.qty, refund_amount=refund))
        db.add(
            StockLedgerEntry(
                shop_id=shop_id, batch_id=bill_line.batch_id, movement_type="return", qty_delta=line.qty,
                reference_type="return", reference_id=str(ret.id),
            )
        )

    ret.total = round(total_refund, 2)
    await db.commit()
    await db.refresh(ret, attribute_names=["lines"])
    return ret
