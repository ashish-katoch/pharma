import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pharma.models.batch import Batch
from pharma.models.purchase import Purchase, PurchaseLine
from pharma.models.bill import StockLedgerEntry
from pharma.models.supplier import SupplierPrice
from pharma.schemas.purchase import PurchaseCreateIn


async def create_purchase(db: AsyncSession, shop_id: uuid.UUID, payload: PurchaseCreateIn) -> Purchase:
    """Creates a purchase, adds new batches (or tops up matching ones), and
    records the stock ledger — one transaction, one commit."""
    total = 0.0
    purchase = Purchase(shop_id=shop_id, supplier_id=payload.supplier_id, invoice_no=payload.invoice_no, total=0)
    db.add(purchase)
    await db.flush()

    for line in payload.lines:
        batch = Batch(
            shop_id=shop_id,
            medicine_id=line.medicine_id,
            supplier_id=payload.supplier_id,
            batch_no=line.batch_no,
            expiry_date=line.expiry_date,
            qty=line.qty,
            purchase_price=line.purchase_price,
            selling_price=line.selling_price,
        )
        db.add(batch)
        await db.flush()

        db.add(
            PurchaseLine(
                purchase_id=purchase.id,
                medicine_id=line.medicine_id,
                batch_id=batch.id,
                qty=line.qty,
                purchase_price=line.purchase_price,
            )
        )
        db.add(
            StockLedgerEntry(
                shop_id=shop_id,
                batch_id=batch.id,
                movement_type="purchase",
                qty_delta=line.qty,
                reference_type="purchase",
                reference_id=str(purchase.id),
            )
        )
        total += line.qty * line.purchase_price

        # Upsert supplier price catalog so future purchases can show a hint
        existing_price = (await db.execute(
            select(SupplierPrice).where(
                SupplierPrice.shop_id == shop_id,
                SupplierPrice.supplier_id == payload.supplier_id,
                SupplierPrice.medicine_id == line.medicine_id,
            )
        )).scalar_one_or_none()
        if existing_price:
            existing_price.purchase_price = line.purchase_price
        else:
            db.add(SupplierPrice(
                shop_id=shop_id,
                supplier_id=payload.supplier_id,
                medicine_id=line.medicine_id,
                purchase_price=line.purchase_price,
            ))

    purchase.total = round(total, 2)
    await db.commit()
    return purchase
