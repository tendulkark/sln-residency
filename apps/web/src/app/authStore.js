import { create } from "zustand";
import { applyTenantTheme } from "@/lib/theme.js";

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

  // Applies a fresh /me read (user, tenant, permissions) without touching
  // the access token — how a role or branding change an Admin made reaches
  // a console that's already open. Only replaces what actually changed, so
  // a no-op sync doesn't re-render every permission-gated screen.
  syncSession: ({ user, tenant, permissions }) =>
    set((state) => {
      const next = {};
      if (JSON.stringify(user) !== JSON.stringify(state.user)) next.user = user;
      if (JSON.stringify(tenant) !== JSON.stringify(state.tenant)) {
        applyTenantTheme(tenant);
        next.tenant = tenant;
      }
      if (permissions.length !== state.permissions.size || permissions.some((code) => !state.permissions.has(code))) {
        next.permissions = new Set(permissions);
      }
      return next;
    }),

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
