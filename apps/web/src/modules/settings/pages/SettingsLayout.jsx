import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/app/authStore.js";
import { PageHeader } from "@/ui/index.js";
import { SETTINGS_NAV_ITEM, SETTINGS_TABS, settingsTabPath } from "@/modules/settings/constants.js";

// The Settings hub: one sidebar entry, one tab per area of hotel
// configuration. Each tab shows only for a role holding its permission, and
// each tab's route is gated on that same permission (app/router.jsx) — the
// API re-checks every request regardless (AI_RULES.md #3).
export default function SettingsLayout() {
  const permissions = useAuthStore((s) => s.permissions);
  const tabs = SETTINGS_TABS.filter((t) => permissions.has(t.permission));

  return (
    <div>
      <PageHeader icon={SETTINGS_NAV_ITEM.icon} title="Settings" subtitle="How this hotel is set up — its letterhead, GST, payment methods and statuses" />

      {tabs.length > 1 && (
        <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Settings sections">
          {tabs.map((t) => (
            <NavLink
              key={t.path}
              to={settingsTabPath(t)}
              className={({ isActive }) =>
                `-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                  isActive ? "border-brand text-brand" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink"
                }`
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Outlet />
    </div>
  );
}

// Bare /settings opens the first tab this role may see.
export function SettingsIndex() {
  const permissions = useAuthStore((s) => s.permissions);
  const first = SETTINGS_TABS.find((t) => permissions.has(t.permission));
  return first ? <Navigate to={settingsTabPath(first)} replace /> : null;
}
