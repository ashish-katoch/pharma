// Local medicine-catalogue cache so search/billing keep working offline.
//
// Every successful catalogue fetch is merged (by id) into a single cached list.
// When a fetch fails on connectivity, callers fall back to a local filter over
// that cache. Stock counts in the cache may be stale offline — acceptable for the
// single-device model; the authoritative deduction still happens server-side when
// the queued bill replays.

import { api, isNetworkError } from "@/src/api";
import { Medicine } from "@/src/cart";
import { storage } from "@/src/utils/storage";

const KEY = "@pharma_catalog_v1";

async function readCache(): Promise<Medicine[]> {
  const raw = await storage.getItem(KEY, "[]");
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as Medicine[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(list: Medicine[]): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(list));
}

export async function getCachedCatalog(): Promise<Medicine[]> {
  return readCache();
}

/** Merge freshly fetched medicines into the cache (new records win on id). */
export async function mergeIntoCache(items: Medicine[]): Promise<void> {
  if (!items.length) return;
  const existing = await readCache();
  const map = new Map<string, Medicine>();
  for (const m of existing) map.set(m.id, m);
  for (const m of items) map.set(m.id, m);
  await writeCache(Array.from(map.values()));
}

export function localSearch(list: Medicine[], q: string): Medicine[] {
  const term = q.trim().toLowerCase();
  const matches = term
    ? list.filter((m) => {
        return (
          m.name?.toLowerCase().includes(term) ||
          m.brand?.toLowerCase().includes(term) ||
          m.generic?.toLowerCase().includes(term) ||
          (m as any).barcode === q
        );
      })
    : list;
  return [...matches].sort((a, b) => a.name.localeCompare(b.name));
}

export type SearchResult = { items: Medicine[]; source: "network" | "cache" };

/**
 * Search medicines, transparently falling back to the offline cache when the
 * request can't reach the server. Successful network results refresh the cache.
 */
export async function searchMedicines(q: string): Promise<SearchResult> {
  try {
    const items = await api<Medicine[]>(
      `/medicines${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    );
    await mergeIntoCache(items);
    return { items, source: "network" };
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = await readCache();
      return { items: localSearch(cached, q), source: "cache" };
    }
    throw e;
  }
}
