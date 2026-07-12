import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "@pharma_auth_token";

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  form?: Record<string, string>;
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
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, { method, headers, body });
  const raw = await res.text();
  let data: any = raw;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    const detail = typeof data === "object" ? data?.detail || JSON.stringify(data) : String(data);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return data as T;
}
