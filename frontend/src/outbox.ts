// Offline write queue ("outbox").
//
// When a bill can't reach the server it is parked here and replayed once
// connectivity returns. Persisted as a single JSON-encoded string under one
// AsyncStorage key (the storage wrapper only stores string|number|boolean|null,
// so we serialize the list ourselves).
//
// Single-device model per the V1 spec: the local queue is the source of truth
// while offline; there is no multi-writer conflict to resolve.

import { storage } from "@/src/utils/storage";

const KEY = "@pharma_outbox_v1";
const FAILED_KEY = "@pharma_outbox_failed_v1";

/** A bill create request captured while offline, awaiting replay. */
export type OutboxBill = {
  id: string; // local uuid, distinct from any server bill id
  type: "bill";
  payload: any; // the exact BillCreate body to POST
  localBillNo: string; // human-facing placeholder, e.g. OFFLINE-3F2A
  itemsCount: number;
  total: number; // best-effort local total for display
  createdAt: string; // ISO
};

/** An outbox bill the server rejected (e.g. stock ran out) — kept for the user to review. */
export type FailedBill = OutboxBill & { reason: string; failedAt: string };

function uuid(): string {
  // RFC4122-ish; good enough for local ids without pulling in a dep.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readList<T>(key: string): Promise<T[]> {
  const raw = await storage.getItem(key, "[]");
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeList<T>(key: string, list: T[]): Promise<void> {
  await storage.setItem(key, JSON.stringify(list));
}

export async function getOutbox(): Promise<OutboxBill[]> {
  return readList<OutboxBill>(KEY);
}

export async function getFailed(): Promise<FailedBill[]> {
  return readList<FailedBill>(FAILED_KEY);
}

/** Queue a bill payload for later replay. Returns the created outbox entry. */
export async function enqueueBill(
  payload: any,
  meta: { itemsCount: number; total: number },
): Promise<OutboxBill> {
  const list = await getOutbox();
  const entry: OutboxBill = {
    id: uuid(),
    type: "bill",
    payload,
    localBillNo: "OFFLINE-" + uuid().slice(0, 4).toUpperCase(),
    itemsCount: meta.itemsCount,
    total: meta.total,
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  await writeList(KEY, list);
  return entry;
}

export async function removeFromOutbox(id: string): Promise<void> {
  const list = await getOutbox();
  await writeList(
    KEY,
    list.filter((e) => e.id !== id),
  );
}

/** Move an entry out of the retry queue into the failed list with a reason. */
export async function markFailed(entry: OutboxBill, reason: string): Promise<void> {
  await removeFromOutbox(entry.id);
  const failed = await getFailed();
  failed.push({ ...entry, reason, failedAt: new Date().toISOString() });
  await writeList(FAILED_KEY, failed);
}

export async function clearFailed(): Promise<void> {
  await writeList<FailedBill>(FAILED_KEY, []);
}
