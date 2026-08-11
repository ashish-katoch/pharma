// Catalogue search — network-first, SQLite-cache fallback.
//
// On a successful network call we upsert the results into the local SQLite
// medicines + batches tables (replacing the old AsyncStorage cache).  When
// offline we run the same query against SQLite so billing keeps working.

import { api, isNetworkError } from "@/src/api";
import { Medicine } from "@/src/cart";
import {
  searchLocal,
  upsertMedicines,
  upsertBatches,
} from "@/src/repositories/MedicineRepository";

export type SearchResult = { items: Medicine[]; source: "network" | "cache" };

export async function searchMedicines(q: string): Promise<SearchResult> {
  try {
    const items = await api<any[]>(
      `/medicines${q ? `?q=${encodeURIComponent(q)}` : ""}`
    );
    // Refresh the local cache so offline billing sees fresh stock counts.
    await upsertMedicines(items).catch(() => {});
    return { items: items as Medicine[], source: "network" };
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = await searchLocal(q);
      return { items: cached as Medicine[], source: "cache" };
    }
    throw e;
  }
}

// Re-export so existing imports in scan.tsx etc still compile.
export { searchLocal as localSearch };
