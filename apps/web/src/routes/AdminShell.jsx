import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, BedDouble, Sparkles, CalendarDays, LogOut, Hotel } from "lucide-react";
import { useAuthStore } from "../store/authStore.js";
import { apiFetch } from "../lib/api.js";
import { Button } from "../ui/index.js";

// Nav items declare the permission they require; an item is hidden if the
// signed-in user lacks it. This is a UX nicety only — the API re-checks
// every request regardless (AI_RULES.md #3).
const NAV_ITEMS = [
  { to: "/dashboard", label: "Hotel Dashboard", permission: "rooms.view", icon: LayoutDashboard },
  { to: "/rooms-setup", label: "Rooms Setup", permission: "rooms.view", icon: BedDouble },
  { to: "/housekeeping", label: "Housekeeping", permission: "rooms.housekeeping", icon: Sparkles },
  { to: "/reservations", label: "Reservations", permission: "bookings.view", icon: CalendarDays },
  // Staff and Settings land in later phases.
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
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Hotel className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{tenant?.name ?? "SLN Residency"}</p>
            <p className="text-xs text-gray-500">Staff console</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.filter((item) => permissions.has(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-brand text-white" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="truncate text-xs text-gray-500">{user?.roleName}</p>
          <Button variant="outline" size="sm" onClick={handleLogout} className="mt-3 w-full">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
