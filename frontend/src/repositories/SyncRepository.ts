import { getDb } from "../db/database";
import { SyncQueueEntry } from "./types";

export async function getPendingQueue(): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  return db.getAllAsync<SyncQueueEntry>(
    `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`
  );
}

export async function getFailedQueue(): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  return db.getAllAsync<SyncQueueEntry>(
    `SELECT * FROM sync_queue WHERE status = 'failed' ORDER BY created_at ASC`
  );
}

export async function removeSyncEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function markSyncFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'failed', error = ?, retry_count = retry_count + 1, last_attempted_at = ?
     WHERE id = ?`,
    [error, new Date().toISOString(), id]
  );
}

export async function markSyncAttempted(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue SET retry_count = retry_count + 1, last_attempted_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

export async function clearFailedQueue(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE status = 'failed'`);
}

export async function resetSyncEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', retry_count = 0, error = NULL, last_attempted_at = NULL WHERE id = ?`,
    [id]
  );
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM sync_queue WHERE status = 'pending'`
  );
  return row?.n ?? 0;
}

export async function getFailedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM sync_queue WHERE status = 'failed'`
  );
  return row?.n ?? 0;
}

// Sync cursor — stores the last pull timestamp so we only fetch changes since then.
export async function getSyncCursor(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = 'last_pull_at'`
  );
  return row?.value ?? null;
}

export async function setSyncCursor(ts: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES ('last_pull_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [ts]
  );
}
