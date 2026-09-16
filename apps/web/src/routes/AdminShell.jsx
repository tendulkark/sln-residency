import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, BedDouble, Sparkles, CalendarDays, LogOut, Hotel, Settings } from "lucide-react";
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
  { to: "/settings", label: "Settings", permission: "settings.manage", icon: Settings },
  // Staff management lands in a later phase.
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
      <aside className="flex w-60 flex-col border-r border-line bg-card">
        <div className="divine-rule" />
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-9 w-9 shrink-0 rounded-full object-contain ring-2 ring-gold-tint" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand ring-2 ring-gold-tint">
              <Hotel className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-gray-900">{tenant?.name ?? "Staff Console"}</p>
            <p className="text-xs text-gray-500">Staff console</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.filter((item) => permissions.has(item.permission)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition ${
                  isActive ? "border-gold bg-brand-tint text-brand" : "border-transparent text-gray-700 hover:bg-muted-strong"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-4">
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
