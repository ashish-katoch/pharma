// DbProvider — opens the SQLite database and does an initial pull of medicines
// + batches from the server so the local catalog is populated on first launch
// (or after a fresh install on a new device).
//
// Renders children immediately; the pull happens in the background so the app
// doesn't block on it. useDbReady() returns true once the DB is open (not
// necessarily pulled).

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Platform } from "react-native";
import { getDb } from "./database";
import { upsertMedicines, upsertBatches } from "../repositories/MedicineRepository";
import { getSyncCursor, setSyncCursor } from "../repositories/SyncRepository";
import { api } from "../api";

type DbContextValue = { ready: boolean };
const DbCtx = createContext<DbContextValue>({ ready: false });

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        setReady(true);
        return;
      }
      try {
        await getDb();
        setReady(true);
        pullChanges().catch(() => {});
      } catch (e) {
        console.warn("[DbProvider] failed to open DB:", e);
        setReady(true);
      }
    })();
  }, []);

  return <DbCtx.Provider value={{ ready }}>{children}</DbCtx.Provider>;
}

export function useDbReady(): boolean {
  return useContext(DbCtx).ready;
}

// Exported so auth.tsx can trigger a pull immediately after login.
export async function pullChanges(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const cursor = await getSyncCursor();
    const qs = cursor ? `?since=${encodeURIComponent(cursor)}` : "";
    const data = await api<{
      medicines: any[];
      batches: any[];
      pulled_at: string;
    }>(`/sync/changes${qs}`);

    await upsertMedicines(data.medicines ?? []);
    await upsertBatches(data.batches ?? []);
    if (data.pulled_at) await setSyncCursor(data.pulled_at);
  } catch {
    // Network unavailable or endpoint not yet deployed — silently ignore.
  }
}
