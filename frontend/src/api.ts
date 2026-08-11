import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "@pharma_auth_token";

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  form?: Record<string, string>;
  formData?: FormData;
  auth?: boolean;
};

export async function getToken(): Promise<string | null> {
  return storage.secureGet(TOKEN_KEY, "");
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

/**
 * Error thrown by {@link api}. `isNetwork` is true when the request never reached
 * the server (device offline, DNS/timeout) — the offline outbox keys off this to
 * decide whether to queue a write vs. surface a real server error. `status` holds
 * the HTTP status for non-network failures.
 */
export class ApiError extends Error {
  status?: number;
  isNetwork: boolean;
  constructor(message: string, opts: { status?: number; isNetwork?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.isNetwork = !!opts.isNetwork;
  }
}

/** True when the throw came from connectivity loss rather than a server response. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.isNetwork;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = Object.entries(opts.form)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  } else if (opts.formData) {
    // Let browser/React Native set multipart/form-data Content-Type (with boundary)
    body = opts.formData as unknown as BodyInit;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }

  const url = `${BASE_URL}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (e: any) {
    // fetch rejects (TypeError) only when the request never completed — treat as offline.
    throw new ApiError(e?.message || "Network request failed", { isNetwork: true });
  }
  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status}`, { status: res.status });
    }
    throw new ApiError(`Unexpected non-JSON response: ${raw.slice(0, 120)}`, { status: res.status });
  }
  if (!res.ok) {
    const detail = typeof data === "object" ? data?.detail || JSON.stringify(data) : String(data);
    throw new ApiError(detail || `HTTP ${res.status}`, { status: res.status });
  }
  return data as T;
}
