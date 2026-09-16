import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";
import { apiFetch } from "../lib/api.js";

// Nav items declare the permission they require; an item is hidden if the
// signed-in user lacks it. This is a UX nicety only — the API re-checks
// every request regardless (AI_RULES.md #3).
const NAV_ITEMS = [
  { to: "/rooms", label: "Rooms", permission: "rooms.view" },
  // Bookings, Staff, and Settings land in later phases.
];

export default function AdminShell() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const permissions = useAuthStore((s) => s.permissions);
  const clearSession = useAuthStore((s) => s.clearSession);

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <p className="text-sm font-semibold text-gray-900">{tenant?.name ?? "SLN Residency"}</p>
          <p className="text-xs text-gray-500">Staff console</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.filter((item) => permissions.has(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="truncate text-xs text-gray-500">{user?.roleName}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
