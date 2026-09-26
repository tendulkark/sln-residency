import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncSession } from "@/lib/api.js";

// A front-desk PC can sit on one screen all shift. Without this, a role
// change (or a deactivation, or "sign out that device") only reached it at
// the next sign-in. syncSession() rate-limits itself, so these triggers
// cost at most one small /me request every 30 seconds.
const BACKGROUND_SYNC_MS = 5 * 60_000;

export function useSessionSync() {
  const { pathname } = useLocation();

  // Moving to another module.
  useEffect(() => {
    syncSession();
  }, [pathname]);

  // Coming back to the tab/app, and a slow background tick while visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") syncSession();
    };
    const timer = setInterval(onVisible, BACKGROUND_SYNC_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
