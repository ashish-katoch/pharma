import { getDb } from "../db/database";
import { LocalMedicine, LocalBatch } from "./types";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Upsert medicines pulled from the server into local SQLite.
export async function upsertMedicines(medicines: any[]): Promise<void> {
  if (!medicines.length) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const m of medicines) {
      await db.runAsync(
        `INSERT INTO medicines
           (id, name, brand, generic, strength, pack, hsn, schedule, gst_rate, mrp,
            barcode, reorder_level, created_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, brand=excluded.brand, generic=excluded.generic,
           strength=excluded.strength, pack=excluded.pack, hsn=excluded.hsn,
           schedule=excluded.schedule, gst_rate=excluded.gst_rate, mrp=excluded.mrp,
           barcode=excluded.barcode, reorder_level=excluded.reorder_level,
           updated_at=excluded.updated_at`,
        [
          m.id, m.name, m.brand ?? "", m.generic ?? "", m.strength ?? "",
          m.pack ?? "", m.hsn ?? "3004", m.schedule ?? "OTC",
          m.gst_rate ?? 12.0, m.mrp ?? 0.0, m.barcode ?? "",
          m.reorder_level ?? 10, m.created_at ?? now, now,
        ]
      );
    }
  });
}

// Upsert batches pulled from the server.
export async function upsertBatches(batches: any[]): Promise<void> {
  if (!batches.length) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const b of batches) {
      await db.runAsync(
        `INSERT INTO batches
           (id, medicine_id, batch_no, expiry, quantity, mrp, purchase_price, created_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           quantity=excluded.quantity, mrp=excluded.mrp, updated_at=excluded.updated_at`,
        [
          b.id, b.medicine_id, b.batch_no, b.expiry,
          b.quantity ?? 0, b.mrp ?? 0.0, b.purchase_price ?? 0.0,
          b.created_at ?? now, now,
        ]
      );
    }
  });
}

// Search medicines locally with a running total_stock join.
export async function searchLocal(q: string): Promise<LocalMedicine[]> {
  const db = await getDb();
  const term = q.trim();
  const like = `%${term}%`;

  const rows = await db.getAllAsync<LocalMedicine>(
    `SELECT m.*,
       COALESCE(SUM(CASE WHEN b.deleted = 0 AND b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id
     WHERE m.deleted = 0
       AND (m.name LIKE ? OR m.brand LIKE ? OR m.generic LIKE ? OR (? != '' AND m.barcode = ?))
     GROUP BY m.id
     ORDER BY m.name`,
    [like, like, like, term, term]
  );
  return rows;
}

// Get a single medicine with live stock count (used for bill-line display).
export async function getMedicineById(id: string): Promise<LocalMedicine | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalMedicine>(
    `SELECT m.*,
       COALESCE(SUM(CASE WHEN b.deleted = 0 AND b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id
     WHERE m.id = ? AND m.deleted = 0
     GROUP BY m.id`,
    [id]
  );
  return row ?? null;
}

// FEFO batches for a medicine, only positive-stock rows.
export async function getFefoBatches(medicineId: string): Promise<LocalBatch[]> {
  const db = await getDb();
  return db.getAllAsync<LocalBatch>(
    `SELECT * FROM batches
     WHERE medicine_id = ? AND quantity > 0 AND deleted = 0
     ORDER BY expiry ASC`,
    [medicineId]
  );
}

// Decrement a batch by qty inside an existing transaction.
export async function decrementBatch(
  batchId: string,
  qty: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE batches SET quantity = quantity - ?, updated_at = ? WHERE id = ?`,
    [qty, new Date().toISOString(), batchId]
  );
}
