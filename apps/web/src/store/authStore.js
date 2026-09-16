import { create } from "zustand";

// Access token lives in memory only (never localStorage) — the refresh
// token is an httpOnly cookie the browser handles for us, so there is
// nothing here for an XSS payload to steal beyond the short-lived access
// token itself.
export const useAuthStore = create((set) => ({
  accessToken: null,
  user: null,
  tenant: null,
  permissions: new Set(),

  setSession: ({ accessToken, user, tenant, permissions }) =>
    set({ accessToken, user, tenant, permissions: new Set(permissions) }),

  clearSession: () => set({ accessToken: null, user: null, tenant: null, permissions: new Set() }),

  hasPermission: (code) => useAuthStore.getState().permissions.has(code),
}));
