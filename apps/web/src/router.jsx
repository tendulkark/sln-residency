import { createBrowserRouter } from "react-router-dom";
import RootLayout from "@/app/RootLayout.jsx";
import ProtectedRoute from "@/modules/auth/ProtectedRoute.jsx";
import RequirePermission, { HomeRedirect } from "@/modules/auth/RequirePermission.jsx";
import Login from "@/modules/auth/Login.jsx";
import { LOGIN_ROUTE_PATH } from "@/modules/auth/constants.js";
import AdminShell from "@/app/AdminShell.jsx";
import DashboardPage from "@/modules/dashboard/DashboardPage.jsx";
import { DASHBOARD_NAV_ITEM } from "@/modules/dashboard/constants.js";
import RoomsSetupPage from "@/modules/rooms/RoomsSetupPage.jsx";
import { ROOMS_NAV_ITEM } from "@/modules/rooms/constants.js";
import HousekeepingPage from "@/modules/housekeeping/HousekeepingPage.jsx";
import { HOUSEKEEPING_NAV_ITEM } from "@/modules/housekeeping/constants.js";
import ReservationsPage from "@/modules/reservations/ReservationsPage.jsx";
import { RESERVATIONS_NAV_ITEM } from "@/modules/reservations/constants.js";
import SettingsPage from "@/modules/settings/SettingsPage.jsx";
import { SETTINGS_NAV_ITEM } from "@/modules/settings/constants.js";
import ReportsPage from "@/modules/reports/ReportsPage.jsx";
import { REPORTS_NAV_ITEM } from "@/modules/reports/constants.js";
import InvoicesPage from "@/modules/invoices/InvoicesPage.jsx";
import { INVOICES_NAV_ITEM } from "@/modules/invoices/constants.js";

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
      { path: LOGIN_ROUTE_PATH, element: <Login /> },
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
            ],
          },
        ],
      },
    ],
  },
]);
