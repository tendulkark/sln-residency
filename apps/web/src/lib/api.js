import { useAuthStore } from "../store/authStore.js";

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
      "Content-Type": "application/json",
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
