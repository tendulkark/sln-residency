import { create } from "zustand";
import { applyTenantTheme } from "../lib/theme.js";

// Access token lives in memory only (never localStorage) — the refresh
// token is an httpOnly cookie the browser handles for us, so there is
// nothing here for an XSS payload to steal beyond the short-lived access
// token itself.
export const useAuthStore = create((set) => ({
  accessToken: null,
  user: null,
  tenant: null,
  permissions: new Set(),

  setSession: ({ accessToken, user, tenant, permissions }) => {
    applyTenantTheme(tenant);
    set({ accessToken, user, tenant, permissions: new Set(permissions) });
  },

  // Merges a partial tenant profile update (e.g. from the Settings screen)
  // into the current session without touching auth tokens, and reapplies
  // the brand color immediately if it changed.
  updateTenant: (partial) =>
    set((state) => {
      const tenant = { ...state.tenant, ...partial };
      applyTenantTheme(tenant);
      return { tenant };
    }),

  clearSession: () => {
    applyTenantTheme(null);
    set({ accessToken: null, user: null, tenant: null, permissions: new Set() });
  },

  hasPermission: (code) => useAuthStore.getState().permissions.has(code),
}));
