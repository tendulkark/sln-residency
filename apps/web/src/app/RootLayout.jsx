import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuthStore } from "@/app/authStore.js";
import { refreshSession } from "@/lib/api.js";

// Runs once on app load: tries to silently restore a session from the
// httpOnly refresh cookie before rendering anything that depends on
// auth state, so a page reload doesn't bounce a logged-in user to /login.
export default function RootLayout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenant = useAuthStore((s) => s.tenant);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (accessToken) {
      setBootstrapped(true);
      return;
    }
    refreshSession().finally(() => setBootstrapped(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The browser tab/PWA title is generic pre-login (index.html) — once a
  // tenant is known, it should say which hotel this session belongs to.
  useEffect(() => {
    document.title = tenant?.name ? `${tenant.name} — Staff Console` : "Hotel Staff Console";
  }, [tenant]);

  if (!bootstrapped) {
    // Same cream + lattice + brand-rule treatment as the sign-in screen, so
    // a cold start / reload doesn't flash an unstyled grey "Loading…" before
    // the themed shell appears.
    return (
      <div className="divine-pattern flex h-screen flex-col items-center justify-center gap-3 text-ink-muted">
        <div className="divine-rule w-14 rounded-full" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return <Outlet />;
}
