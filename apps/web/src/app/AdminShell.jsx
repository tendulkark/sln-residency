import { Fragment, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";
import { LogOut, Hotel, ChevronLeft, ChevronRight, Menu as MenuIcon } from "lucide-react";
import { useAuthStore } from "@/app/authStore.js";
import { apiFetch } from "@/lib/api.js";
import { Button } from "@/ui/index.js";
import { NAV_ITEMS } from "@/app/navigation.js";
import { LOGIN_ROUTE_PATH } from "@/modules/auth/constants.js";
import { PROFILE_ROUTE_PATH } from "@/modules/profile/constants.js";
import { ModuleRefreshProvider } from "@/app/ModuleRefresh.jsx";
import { useSessionSync } from "@/app/useSessionSync.js";

const SIDEBAR_COLLAPSED_KEY = "sln:sidebarCollapsed";

// The sidebar's header/nav/footer markup — shared by the persistent desktop
// rail (which can also collapse to icons-only) and the mobile drawer (which
// is always shown full-width, since it's already an overlay the user
// dismisses). `onNavigate` lets the mobile drawer close itself on tap.
function SidebarContent({ collapsed, tenant, user, permissions, onNavigate, onLogout }) {
  return (
    <>
      <div className="divine-rule shrink-0" />
      <div className={`flex shrink-0 items-center gap-2.5 border-b border-line py-4 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-9 w-9 shrink-0 rounded-full object-contain ring-2 ring-gold-tint" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand ring-2 ring-gold-tint">
            <Hotel className="h-4 w-4" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-ink">{tenant?.name ?? "Staff Console"}</p>
            <p className="text-xs text-ink-muted">Staff console</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.filter((item) => permissions.has(item.permission)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md border-l-2 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                collapsed ? "justify-center px-2" : "px-3"
              } ${isActive ? "border-gold bg-brand-tint font-semibold text-brand" : "border-transparent text-ink-soft hover:bg-muted-strong hover:text-ink"}`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      <div className={`shrink-0 border-t border-line bg-muted/60 p-4 ${collapsed ? "px-2" : ""}`}>
        {!collapsed && (
          <NavLink
            to={PROFILE_ROUTE_PATH}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-md p-1 -m-1 transition hover:bg-muted-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            title="View your profile"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white ring-2 ring-gold-tint"
            >
              {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
              <p className="truncate text-xs text-ink-muted">{user?.roleName}</p>
            </div>
          </NavLink>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          title={collapsed ? "Sign out" : undefined}
          className={collapsed ? "w-full px-0" : "mt-3 w-full"}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!collapsed && "Sign out"}
        </Button>
      </div>
    </>
  );
}

export default function AdminShell() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const permissions = useAuthStore((s) => s.permissions);
  const clearSession = useAuthStore((s) => s.clearSession);
  useSessionSync();

  // A per-browser UI preference, not tenant/business data — localStorage is
  // the right home for it, not the server. Only meaningful for the desktop
  // persistent rail; the mobile drawer always opens full-width.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
    navigate(LOGIN_ROUTE_PATH, { replace: true });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      {/* Mobile top bar — the persistent rail below is hidden below md, so
          phones/small tablets get a hamburger-triggered drawer instead. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-3 md:hidden">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-ink-soft hover:bg-muted-strong"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-7 w-7 shrink-0 rounded-full object-contain ring-2 ring-gold-tint" />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand ring-2 ring-gold-tint">
            <Hotel className="h-3.5 w-3.5" />
          </div>
        )}
        <p className="truncate font-display text-lg font-bold text-ink">{tenant?.name ?? "Staff Console"}</p>
      </div>

      <Transition show={mobileNavOpen} as={Fragment}>
        <Dialog onClose={() => setMobileNavOpen(false)} className="relative z-50 md:hidden">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-scrim/50" />
          </TransitionChild>

          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <DialogPanel className="fixed inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-card shadow-xl">
              <SidebarContent
                collapsed={false}
                tenant={tenant}
                user={user}
                permissions={permissions}
                onNavigate={() => setMobileNavOpen(false)}
                onLogout={handleLogout}
              />
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Desktop persistent rail — collapsible between icons-only and full
          width, entirely hidden on mobile in favor of the drawer above. */}
      <aside
        className={`relative hidden shrink-0 flex-col border-r border-line bg-card transition-[width] duration-200 md:flex ${
          collapsed ? "w-[76px]" : "w-60"
        }`}
      >
        <SidebarContent collapsed={collapsed} tenant={tenant} user={user} permissions={permissions} onLogout={handleLogout} />

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-card text-ink-muted shadow-sm transition hover:bg-muted hover:text-brand"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ModuleRefreshProvider>
          <Outlet />
        </ModuleRefreshProvider>
      </main>
    </div>
  );
}
