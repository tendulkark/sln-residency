import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";
import { refreshSession } from "../lib/api.js";

// Runs once on app load: tries to silently restore a session from the
// httpOnly refresh cookie before rendering anything that depends on
// auth state, so a page reload doesn't bounce a logged-in user to /login.
export default function RootLayout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (accessToken) {
      setBootstrapped(true);
      return;
    }
    refreshSession().finally(() => setBootstrapped(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return <Outlet />;
}
