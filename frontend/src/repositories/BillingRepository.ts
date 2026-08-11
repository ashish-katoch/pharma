// BillingRepository — the core offline-billing engine.
//
// createBill() runs a single SQLite EXCLUSIVE transaction that:
//   1. FEFO-picks batches locally
//   2. Deducts batch quantities
//   3. Inserts bill + bill_lines + stock_ledger entries
//   4. Enqueues a sync_queue entry so SyncService can POST to the backend
//
// If ANY step inside the transaction throws, SQLite rolls everything back.
// Stock is never half-deducted.

import { getDb } from "../db/database";
import { getFefoBatches, decrementBatch } from "./MedicineRepository";
import { LocalBill, LocalBillLine, CreateBillParams } from "./types";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function genId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function createBill(params: CreateBillParams): Promise<LocalBill> {
  const db = await getDb();
  const billId = genId();
  const now = new Date().toISOString();
  const localBillNo = `LOCAL-${billId.slice(-6).toUpperCase()}`;

  const pickedLines: LocalBillLine[] = [];
  // sync payload lines (batch-explicit so server doesn't re-FEFO)
  const syncLines: Array<{
    medicine_id: string;
    batch_id: string;
    quantity: number;
    discount_pct: number;
  }> = [];

  let subtotal = 0,
    totalDiscount = 0,
    taxableTotal = 0,
    cgstTotal = 0,
    sgstTotal = 0;

  await db.withTransactionAsync(async () => {
    for (const item of params.lines) {
      const { medicine_id, medicine_name, strength, hsn, gst_rate, quantity, discount_pct } = item;
      const batches = await getFefoBatches(medicine_id);

      let remaining = quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.quantity);

        // GST-inclusive MRP → split taxable ex-GST + GST
        const gross = take * batch.mrp;
        const lineDisc = gross * (discount_pct / 100);
        const taxable = gross - lineDisc; // GST-inclusive taxable
        const taxableEx = r2(taxable / (1 + gst_rate / 100));
        const gstAmt = r2(taxable - taxableEx);
        const cgst = r2(gstAmt / 2);
        const sgst = r2(gstAmt - cgst);
        const lineTotal = r2(taxable);

        await decrementBatch(batch.id, take);

        const lineId = genId();
        const line: LocalBillLine = {
          id: lineId,
          bill_id: billId,
          medicine_id,
          medicine_name,
          strength,
          hsn,
          batch_id: batch.id,
          batch_no: batch.batch_no,
          expiry: batch.expiry,
          quantity: take,
          mrp: batch.mrp,
          discount_pct,
          gst_rate,
          taxable_amount: taxableEx,
          cgst,
          sgst,
          line_total: lineTotal,
        };
        pickedLines.push(line);

        await db.runAsync(
          `INSERT INTO bill_lines
             (id, bill_id, medicine_id, medicine_name, strength, hsn, batch_id, batch_no, expiry,
              quantity, mrp, discount_pct, gst_rate, taxable_amount, cgst, sgst, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lineId, billId, medicine_id, medicine_name, strength, hsn,
            batch.id, batch.batch_no, batch.expiry, take, batch.mrp,
            discount_pct, gst_rate, taxableEx, cgst, sgst, lineTotal,
          ]
        );

        await db.runAsync(
          `INSERT INTO stock_ledger (id, medicine_id, batch_id, change, type, reference, actor, created_at)
           VALUES (?, ?, ?, ?, 'sale', ?, ?, ?)`,
          [genId(), medicine_id, batch.id, -take, billId, params.createdBy, now]
        );

        subtotal += gross;
        totalDiscount += lineDisc;
        taxableTotal += taxableEx;
        cgstTotal += cgst;
        sgstTotal += sgst;
        remaining -= take;

        syncLines.push({ medicine_id, batch_id: batch.id, quantity: take, discount_pct });
      }

      if (remaining > 0) {
        throw new Error(
          `Insufficient local stock for ${medicine_name} (need ${remaining} more units).`
        );
      }
    }

    // Bill-level discount applied on taxable total
    const billDiscAmt = r2(taxableTotal * (params.billDiscountPct / 100));
    taxableTotal = r2(taxableTotal - billDiscAmt);
    totalDiscount = r2(totalDiscount + billDiscAmt);
    const grandTotal = r2(taxableTotal + cgstTotal + sgstTotal);

    const rxJson = params.rxDetails ? JSON.stringify(params.rxDetails) : null;

    await db.runAsync(
      `INSERT INTO bills
         (id, bill_no, customer_name, customer_phone, subtotal, total_discount,
          taxable_total, cgst_total, sgst_total, grand_total, bill_discount_pct,
          payment_mode, status, created_at, created_by, synced, rx_details, customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?)`,
      [
        billId, localBillNo, params.customerName, params.customerPhone,
        r2(subtotal), totalDiscount, taxableTotal,
        r2(cgstTotal), r2(sgstTotal), grandTotal,
        params.billDiscountPct, params.paymentMode, now, params.createdBy, rxJson,
        params.customerId ?? null,
      ]
    );

    // Enqueue for backend sync — includes explicit batch_ids so server doesn't re-FEFO
    const syncPayload = JSON.stringify({
      client_id: billId,
      lines: syncLines,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_id: params.customerId ?? null,
      doctor_id: params.doctorId ?? null,
      doctor_name: params.doctorName ?? null,
      bill_discount_pct: params.billDiscountPct,
      payment_mode: params.paymentMode,
      split_payment: params.splitPayment ?? null,
      rx_details: params.rxDetails ?? null,
      loyalty_points_used: params.loyaltyPointsUsed ?? 0,
    });

    await db.runAsync(
      `INSERT INTO sync_queue (id, entity_type, entity_id, payload, status, retry_count, created_at)
       VALUES (?, 'bill', ?, ?, 'pending', 0, ?)`,
      [genId(), billId, syncPayload, now]
    );
  });

  return getBillById(billId) as Promise<LocalBill>;
}

export async function getBillById(id: string): Promise<LocalBill | null> {
  const db = await getDb();
  const bill = await db.getFirstAsync<Omit<LocalBill, "lines">>(
    `SELECT * FROM bills WHERE id = ?`,
    [id]
  );
  if (!bill) return null;

  const lines = await db.getAllAsync<LocalBillLine>(
    `SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY rowid`,
    [id]
  );
  return { ...bill, lines };
}

export async function listBills(): Promise<Omit<LocalBill, "lines">[]> {
  const db = await getDb();
  return db.getAllAsync<Omit<LocalBill, "lines">>(
    `SELECT b.*, COUNT(bl.id) AS line_count
     FROM bills b
     LEFT JOIN bill_lines bl ON bl.bill_id = b.id
     GROUP BY b.id
     ORDER BY b.created_at DESC`
  );
}

// Mark a local bill as synced and store the server-assigned bill_no.
export async function markBillSynced(
  localId: string,
  serverBillNo: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE bills SET synced = 1, bill_no = ? WHERE id = ?`,
    [serverBillNo, localId]
  );
}

// Void a locally-created bill that was rejected by the server.
// Atomically: restores batch quantities → marks bill cancelled → removes from sync queue.
export async function voidBillLocal(billId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const lines = await db.getAllAsync<LocalBillLine>(
      `SELECT * FROM bill_lines WHERE bill_id = ?`,
      [billId]
    );
    const now = new Date().toISOString();
    for (const line of lines) {
      await db.runAsync(
        `UPDATE batches SET quantity = quantity + ?, updated_at = ? WHERE id = ?`,
        [line.quantity, now, line.batch_id]
      );
    }
    await db.runAsync(`UPDATE bills SET status = 'cancelled' WHERE id = ?`, [billId]);
    await db.runAsync(
      `DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'bill'`,
      [billId]
    );
  });
}
