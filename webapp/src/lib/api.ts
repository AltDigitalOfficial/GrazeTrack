import { auth } from "@/lib/firebase";

const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const normalizedApiBase = (rawApiBase && rawApiBase.length ? rawApiBase : "http://localhost:3001").replace(
  /\/+$/,
  ""
);
const API_BASE = `${normalizedApiBase}/api`;

/**
 * Build Headers safely (no union types with undefined values).
 * This avoids the TS error you saw where Authorization could be undefined.
 */
async function buildAuthHeaders(extra?: Record<string, string>) {
  const headers = new Headers(extra ?? {});

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  // Some endpoints may return 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  // fallback
  return (await res.text()) as unknown as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await buildAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return handleResponse<T>(res);
}

export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildAuthHeaders({ "Content-Type": "application/json" });

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return handleResponse<T>(res);
}

export async function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildAuthHeaders({ "Content-Type": "application/json" });

  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  return handleResponse<T>(res);
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  // IMPORTANT: do NOT set Content-Type manually for FormData
  const headers = await buildAuthHeaders();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });

  return handleResponse<T>(res);
}

export async function apiPutForm<T>(path: string, form: FormData): Promise<T> {
  const headers = await buildAuthHeaders();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: form,
  });

  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await buildAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers });
  return handleResponse<T>(res);
}

// Aliases for convenience
export const apiPost = apiPostJson;
export const apiPut = apiPutJson;

export type MeResponse = {
  user: { id: string; firebaseUid: string; email: string | null };
  ranches: { ranchId: string; ranchName: string | null; role: string }[];
  activeRanchId: string | null;
};

export async function getMe() {
  return apiGet<MeResponse>("/me");
}
