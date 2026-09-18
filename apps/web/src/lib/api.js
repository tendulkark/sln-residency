import { useAuthStore } from "@/modules/auth/authStore.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let refreshPromise = null;

// Exported so the app shell can call this once on load to silently restore
// a session from the httpOnly refresh cookie (e.g. after a page reload,
// when the in-memory access token is gone).
export async function refreshSession() {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!res.ok) {
    useAuthStore.getState().clearSession();
    return null;
  }
  const data = await res.json();
  useAuthStore.getState().setSession(data);
  return data.accessToken;
}

// Central fetch wrapper: attaches the bearer token, sends the httpOnly
// refresh cookie, and on a 401 tries exactly one refresh-and-retry before
// giving up and clearing the session.
export async function apiFetch(path, { retry = true, ...options } = {}) {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      // Only send Content-Type: application/json when there's actually a
      // body — Fastify's JSON body parser rejects a bodiless request (e.g.
      // DELETE) that still declares a JSON content type.
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    const newToken = await refreshPromise;
    if (newToken) {
      return apiFetch(path, { ...options, retry: false });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

// For endpoints that return a file (e.g. a report's CSV export) rather than
// JSON — fetches it with the same auth header as apiFetch, then hands the
// browser a download via a throwaway object URL.
export async function downloadFile(path, filename) {
  const accessToken = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
