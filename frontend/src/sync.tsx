// Sync engine — replays the offline outbox to the backend.
//
// Responsibilities:
//   * expose live pending / failed counts to the UI
//   * auto-flush when connectivity returns, on an interval, and on app foreground
//   * classify replay outcomes: success -> drop; network error -> keep & retry
//     later; server rejection (4xx) -> move to the failed list so it never blocks
//     the queue.
//
// Upload order is FIFO (bills replay in the order they were rung up).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { AppState } from "react-native";
import { api, isNetworkError } from "@/src/api";
import { useNet } from "@/src/net";
import {
  clearFailed as clearFailedStore,
  enqueueBill,
  getFailed,
  getOutbox,
  markFailed,
  OutboxBill,
  removeFromOutbox,
} from "@/src/outbox";

type SyncContextValue = {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  /** Add a bill to the outbox (used when a save is made offline). */
  queueBill: (
    payload: any,
    meta: { itemsCount: number; total: number },
  ) => Promise<OutboxBill>;
  /** Attempt to replay the queue now. No-op if already running or offline. */
  syncNow: () => Promise<void>;
  /** Reload counts from storage (call after inspecting/clearing failures). */
  refresh: () => Promise<void>;
  clearFailed: () => Promise<void>;
};

const SyncCtx = createContext<SyncContextValue | undefined>(undefined);

const RETRY_MS = 15000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { online, check } = useNet();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    const [pending, failed] = await Promise.all([getOutbox(), getFailed()]);
    setPendingCount(pending.length);
    setFailedCount(failed.length);
  }, []);

  const queueBill = useCallback(
    async (payload: any, meta: { itemsCount: number; total: number }) => {
      const entry = await enqueueBill(payload, meta);
      await refresh();
      return entry;
    },
    [refresh],
  );

  const flush = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      // Re-check connectivity before hammering the queue.
      const isOnline = await check();
      if (!isOnline) return;

      let queue = await getOutbox();
      for (const entry of queue) {
        try {
          await api("/bills", { method: "POST", body: entry.payload });
          await removeFromOutbox(entry.id);
        } catch (e: any) {
          if (isNetworkError(e)) {
            // Still offline — stop and keep the rest for the next attempt.
            break;
          }
          // Server rejected it (e.g. insufficient stock now). Park it so a single
          // bad bill can't wedge the whole queue.
          await markFailed(entry, e?.message || "Rejected by server");
        }
      }
    } finally {
      await refresh();
      runningRef.current = false;
      setSyncing(false);
    }
  }, [check, refresh]);

  const syncNow = useCallback(async () => {
    await flush();
  }, [flush]);

  const clearFailed = useCallback(async () => {
    await clearFailedStore();
    await refresh();
  }, [refresh]);

  // Initial load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Flush whenever we come online (and there is something to send).
  useEffect(() => {
    if (online && pendingCount > 0) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Periodic retry while a queue exists.
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = setInterval(() => {
      if (online) flush();
    }, RETRY_MS);
    return () => clearInterval(t);
  }, [pendingCount, online, flush]);

  // Flush on app foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") flush();
    });
    return () => sub.remove();
  }, [flush]);

  return (
    <SyncCtx.Provider
      value={{
        online,
        pendingCount,
        failedCount,
        syncing,
        queueBill,
        syncNow,
        refresh,
        clearFailed,
      }}
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
