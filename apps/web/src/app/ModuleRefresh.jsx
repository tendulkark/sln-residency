import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RotateCw } from "lucide-react";
import { syncSession } from "@/lib/api.js";
import { Button, PageHeaderExtrasContext } from "@/ui/index.js";
import { NAV_ITEMS } from "@/app/navigation.js";
import { PROFILE_ROUTE_PATH } from "@/modules/profile/constants.js";

// "Refresh this module" — the in-app alternative to a browser reload.
// A reload (Ctrl+R/F5) throws the whole app away: the JS is re-parsed, the
// session is re-established from the refresh cookie, every cache is lost,
// and the page's filters, open dialogs and scroll position reset. A module
// refresh instead:
//   1. re-fetches exactly the data on screen right now — the current page
//      and any dialog open over it (React Query's *active* queries), while
//      every other module's cached data is only marked stale, so it is
//      re-fetched when (and only if) that module is next opened;
//   2. re-syncs the signed-in user's permissions/branding from /me, so a
//      role change an Admin just made takes effect;
//   3. clears a crashed page's error screen by re-entering the same route.
// Filters, open dialogs and form input on the page survive.

const ModuleRefreshContext = createContext(null);

const JUST_REFRESHED_MS = 1500;

function moduleLabelFor(pathname) {
  if (pathname.startsWith(PROFILE_ROUTE_PATH)) return "My Profile";
  return NAV_ITEMS.find((item) => pathname.startsWith(item.to))?.label ?? null;
}

// Ctrl+R / Cmd+R / F5 refresh the current module instead of reloading the
// app. Shift (Ctrl+Shift+R, Shift+F5) still does the browser's full
// reload — the way to pick up a new app version by hand.
function isReloadShortcut(e) {
  if (e.shiftKey || e.altKey) return false;
  return e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
}

export function ModuleRefreshProvider({ children }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const inFlight = useRef(null);
  const locationRef = useRef(location);
  locationRef.current = location;

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    setJustRefreshed(false);

    const { pathname, search, hash, state } = locationRef.current;
    navigate({ pathname, search, hash }, { replace: true, state, preventScrollReset: true });

    inFlight.current = Promise.all([
      syncSession({ force: true }),
      queryClient.invalidateQueries({ refetchType: "active" }),
    ]).finally(() => {
      inFlight.current = null;
      setRefreshing(false);
      setLastRefreshedAt(new Date());
      setJustRefreshed(true);
    });
    return inFlight.current;
  }, [navigate, queryClient]);

  useEffect(() => {
    if (!justRefreshed) return undefined;
    const t = setTimeout(() => setJustRefreshed(false), JUST_REFRESHED_MS);
    return () => clearTimeout(t);
  }, [justRefreshed]);

  useEffect(() => {
    function onKeyDown(e) {
      if (!isReloadShortcut(e)) return;
      e.preventDefault();
      refresh();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  const moduleLabel = moduleLabelFor(location.pathname);
  const value = useMemo(
    () => ({ refresh, refreshing, justRefreshed, lastRefreshedAt, moduleLabel }),
    [refresh, refreshing, justRefreshed, lastRefreshedAt, moduleLabel]
  );

  return (
    <ModuleRefreshContext.Provider value={value}>
      <PageHeaderExtrasContext.Provider value={<ModuleRefreshButton />}>{children}</PageHeaderExtrasContext.Provider>
    </ModuleRefreshContext.Provider>
  );
}

export function useModuleRefresh() {
  return useContext(ModuleRefreshContext);
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function ModuleRefreshButton() {
  const ctx = useModuleRefresh();
  if (!ctx) return null;
  const { refresh, refreshing, justRefreshed, lastRefreshedAt, moduleLabel } = ctx;

  const what = moduleLabel ?? "this page";
  const title = `Refresh ${what} (Ctrl+R / F5) — reloads only this screen's data${
    lastRefreshedAt ? `. Last refreshed ${timeFormat.format(lastRefreshedAt)}` : ""
  }`;

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} title={title} aria-label={`Refresh ${what}`}>
      {justRefreshed ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      )}
      <span className="hidden sm:inline">{refreshing ? "Refreshing…" : justRefreshed ? "Updated" : "Refresh"}</span>
    </Button>
  );
}
