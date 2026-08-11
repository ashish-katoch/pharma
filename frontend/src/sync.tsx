// SyncProvider — drains the SQLite sync_queue to the backend over FIFO order.
//
// The public hook API (useSync) is unchanged so all existing screens keep
// working. Internally we use SyncRepository (SQLite) instead of AsyncStorage.
//
// Drain rules:
//   • Network error → stop the run, keep entry as pending, retry later.
//   • 4xx server rejection → mark as failed so it never blocks the queue.
//   • 2xx → remove from queue, stamp local bill as synced with server bill_no.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { api, isNetworkError } from "@/src/api";
import { useNet } from "@/src/net";
import {
  clearFailedQueue,
  getFailedCount,
  getPendingCount,
  getPendingQueue,
  markSyncAttempted,
  markSyncFailed,
  removeSyncEntry,
} from "@/src/repositories/SyncRepository";
import { markBillSynced } from "@/src/repositories/BillingRepository";

export type SyncContextValue = {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
  clearFailed: () => Promise<void>;
};

const SyncCtx = createContext<SyncContextValue | undefined>(undefined);

const RETRY_MS = 15_000;
// Exponential backoff caps: 1 s, 2 s, 4 s, 8 s, 30 s
const backoffMs = (retry: number) =>
  Math.min(1000 * 2 ** retry, 30_000);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { online, check } = useNet();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") return;
    const [p, f] = await Promise.all([getPendingCount(), getFailedCount()]);
    setPendingCount(p);
    setFailedCount(f);
  }, []);

  const flush = useCallback(async () => {
    if (Platform.OS === "web") return;
    if (runningRef.current) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      const isOnline = await check();
      if (!isOnline) return;

      const queue = await getPendingQueue();
      for (const entry of queue) {
        // Respect exponential backoff: skip if last attempt was too recent.
        if (entry.last_attempted_at && entry.retry_count > 0) {
          const wait = backoffMs(entry.retry_count - 1);
          const elapsed =
            Date.now() - new Date(entry.last_attempted_at).getTime();
          if (elapsed < wait) continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(entry.payload);
        } catch {
          await markSyncFailed(entry.id, "Corrupt payload");
          continue;
        }

        try {
          if (entry.entity_type === "bill") {
            const res = await api<{ id: string; bill_no: string }>(
              "/bills",
              { method: "POST", body: payload }
            );
            // Stamp the server-assigned bill_no on the local record.
            if (res?.bill_no) {
              await markBillSynced(entry.entity_id, res.bill_no).catch(() => {});
            }
          }
          await removeSyncEntry(entry.id);
        } catch (e: any) {
          if (isNetworkError(e)) {
            // Device went offline mid-flush; stop and leave the rest pending.
            break;
          }
          const status: number = (e as any)?.status ?? 0;
          if (status >= 500 || status === 0) {
            // Transient server error — keep pending so it retries with backoff.
            await markSyncAttempted(entry.id);
            continue;
          }
          // 4xx — server permanently rejected the payload (bad data). Park it.
          await markSyncFailed(entry.id, e?.message || "Rejected by server");
        }
      }
    } finally {
      await refresh();
      runningRef.current = false;
      setSyncing(false);
    }
  }, [check, refresh]);

  const syncNow = useCallback(() => flush(), [flush]);

  const clearFailed = useCallback(async () => {
    if (Platform.OS === "web") return;
    await clearFailedQueue();
    await refresh();
  }, [refresh]);

  // Initial count load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Flush when coming back online.
  useEffect(() => {
    if (online && pendingCount > 0) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Periodic retry while there are pending entries.
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = setInterval(() => {
      if (online) flush();
    }, RETRY_MS);
    return () => clearInterval(t);
  }, [pendingCount, online, flush]);

  // Flush when app comes to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") flush();
    });
    return () => sub.remove();
  }, [flush]);

  return (
    <SyncCtx.Provider
      value={{ online, pendingCount, failedCount, syncing, syncNow, refresh, clearFailed }}
    >
      {children}
    </SyncCtx.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncCtx);
  if (!ctx) throw new Error("useSync must be inside SyncProvider");
  return ctx;
}
