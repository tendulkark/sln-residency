import { createBrowserRouter } from "react-router-dom";
import RootLayout from "@/app/RootLayout.jsx";
import ProtectedRoute from "@/app/guards/ProtectedRoute.jsx";
import RequirePermission, { HomeRedirect } from "@/app/guards/RequirePermission.jsx";
import LoginPage from "@/modules/auth/pages/LoginPage.jsx";
import { LOGIN_ROUTE_PATH } from "@/modules/auth/constants.js";
import AdminShell from "@/app/AdminShell.jsx";
import DashboardPage from "@/modules/dashboard/pages/DashboardPage.jsx";
import { DASHBOARD_NAV_ITEM } from "@/modules/dashboard/constants.js";
import RoomsSetupPage from "@/modules/rooms/pages/RoomsSetupPage.jsx";
import { ROOMS_NAV_ITEM } from "@/modules/rooms/constants.js";
import HousekeepingPage from "@/modules/housekeeping/pages/HousekeepingPage.jsx";
import { HOUSEKEEPING_NAV_ITEM } from "@/modules/housekeeping/constants.js";
import ReservationsPage from "@/modules/reservations/pages/ReservationsPage.jsx";
import { RESERVATIONS_NAV_ITEM } from "@/modules/reservations/constants.js";
import SettingsPage from "@/modules/settings/pages/SettingsPage.jsx";
import { SETTINGS_NAV_ITEM } from "@/modules/settings/constants.js";
import ReportsPage from "@/modules/reports/pages/ReportsPage.jsx";
import { REPORTS_NAV_ITEM } from "@/modules/reports/constants.js";
import InvoicesPage from "@/modules/invoices/pages/InvoicesPage.jsx";
import { INVOICES_NAV_ITEM } from "@/modules/invoices/constants.js";
import StaffPage from "@/modules/staff/pages/StaffPage.jsx";
import { STAFF_NAV_ITEM } from "@/modules/staff/constants.js";
import ProfilePage from "@/modules/profile/pages/ProfilePage.jsx";
import { PROFILE_ROUTE_PATH } from "@/modules/profile/constants.js";

// Each page is registered from its module's NAV_ITEM so the route path and
// the permission that gates it are the same values the sidebar uses — a
// page the sidebar hides can't be opened by typing its URL either. The
// nested `path` is the module's absolute ROUTE_PATH with the leading "/"
// stripped, since react-router wants a relative segment for children of
// AdminShell — the absolute constant (used by NavLink/Navigate/redirects
// elsewhere) stays the single source of truth.
const page = (navItem, element) => ({
  path: navItem.to.slice(1),
  element: <RequirePermission permission={navItem.permission}>{element}</RequirePermission>,
});

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: LOGIN_ROUTE_PATH, element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AdminShell />,
            children: [
              { index: true, element: <HomeRedirect /> },
              page(DASHBOARD_NAV_ITEM, <DashboardPage />),
              page(ROOMS_NAV_ITEM, <RoomsSetupPage />),
              page(HOUSEKEEPING_NAV_ITEM, <HousekeepingPage />),
              page(RESERVATIONS_NAV_ITEM, <ReservationsPage />),
              page(SETTINGS_NAV_ITEM, <SettingsPage />),
              page(REPORTS_NAV_ITEM, <ReportsPage />),
              page(INVOICES_NAV_ITEM, <InvoicesPage />),
              page(STAFF_NAV_ITEM, <StaffPage />),
              // No RequirePermission wrapper — every signed-in role manages
              // their own account, not just users.manage. ProtectedRoute
              // (the parent) already guarantees authentication.
              { path: PROFILE_ROUTE_PATH.slice(1), element: <ProfilePage /> },
            ],
          },
        ],
      },
    ],
  },
]);
