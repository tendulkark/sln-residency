import { useAuthStore } from "@/app/authStore.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let refreshPromise = null;

export const OFFLINE_MESSAGE = "Can't reach the server. Check the internet connection and try again.";

// fetch() itself only rejects when the request never got an answer (no
// network, server down, DNS) — turn that into one plain-language message
// every screen can show as-is, instead of the browser's "Failed to fetch".
async function send(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
}

// Exported so the app shell can call this once on load to silently restore
// a session from the httpOnly refresh cookie (e.g. after a page reload,
// when the in-memory access token is gone).
export async function refreshSession() {
  let res;
  try {
    res = await send(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
  } catch {
    // Offline at startup: stay signed out for now rather than crash the boot.
    useAuthStore.getState().clearSession();
    return null;
  }
  if (!res.ok) {
    useAuthStore.getState().clearSession();
    return null;
  }
  const data = await res.json();
  useAuthStore.getState().setSession(data);
  return data.accessToken;
}

// How stale the signed-in user's permissions may get before an automatic
// sync (window focus, moving between modules, the background timer)
// re-reads them. A module refresh or a 403 syncs regardless.
const SESSION_SYNC_MIN_INTERVAL_MS = 30_000;
let lastSessionSyncAt = 0;
let sessionSyncPromise = null;

// Re-reads the signed-in user, their role's permissions and the hotel's
// branding from /me into the auth store, so an Admin's role change shows
// up in an open console (sidebar, page guards, buttons) without signing
// out. A deactivated account or a device signed out elsewhere gets a 401
// here, which apiFetch turns into a sign-out.
export function syncSession({ force = false } = {}) {
  if (!useAuthStore.getState().accessToken) return Promise.resolve();
  if (!force && Date.now() - lastSessionSyncAt < SESSION_SYNC_MIN_INTERVAL_MS) return Promise.resolve();

  sessionSyncPromise ??= apiFetch("/me", { syncOnForbidden: false })
    .then((data) => {
      lastSessionSyncAt = Date.now();
      useAuthStore.getState().syncSession(data);
    })
    .catch(() => {}) // offline or signed out — the screens already show that
    .finally(() => {
      sessionSyncPromise = null;
    });
  return sessionSyncPromise;
}

// Central fetch wrapper: attaches the bearer token, sends the httpOnly
// refresh cookie, and on a 401 tries exactly one refresh-and-retry before
// giving up and clearing the session. A 403 means the UI offered something
// this role can no longer do, so the permissions are re-synced right away.
export async function apiFetch(path, { retry = true, syncOnForbidden = true, ...options } = {}) {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await send(`${API_URL}${path}`, {
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
      return apiFetch(path, { ...options, retry: false, syncOnForbidden });
    }
  }

  if (res.status === 403 && syncOnForbidden) syncSession({ force: true });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // A 400 from a shared Zod schema carries per-field messages; surface the
    // first one instead of a bare "Invalid payload", and keep them all on
    // the error so a form can mark each field.
    const fieldErrors = body.details?.fieldErrors ?? {};
    const firstFieldError = Object.values(fieldErrors).flat()[0];
    const error = new Error(body.error === "Invalid payload" && firstFieldError ? firstFieldError : body.error ?? `Request failed: ${res.status}`);
    error.status = res.status;
    error.details = body.details;
    throw error;
  }

  return res.status === 204 ? null : res.json();
}

// For endpoints that return a file (e.g. a report's CSV export) rather than
// JSON — fetches it with the same auth header as apiFetch, then hands the
// browser a download via a throwaway object URL.
export async function downloadFile(path, filename) {
  const accessToken = useAuthStore.getState().accessToken;
  const res = await send(`${API_URL}${path}`, {
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
