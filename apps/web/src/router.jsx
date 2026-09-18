import { createBrowserRouter, Navigate } from "react-router-dom";
import RootLayout from "@/app/RootLayout.jsx";
import ProtectedRoute from "@/modules/auth/ProtectedRoute.jsx";
import Login from "@/modules/auth/Login.jsx";
import { LOGIN_ROUTE_PATH } from "@/modules/auth/constants.js";
import AdminShell from "@/app/AdminShell.jsx";
import DashboardPage from "@/modules/dashboard/DashboardPage.jsx";
import { DASHBOARD_ROUTE_PATH } from "@/modules/dashboard/constants.js";
import RoomsSetupPage from "@/modules/rooms/RoomsSetupPage.jsx";
import { ROOMS_ROUTE_PATH } from "@/modules/rooms/constants.js";
import HousekeepingPage from "@/modules/housekeeping/HousekeepingPage.jsx";
import { HOUSEKEEPING_ROUTE_PATH } from "@/modules/housekeeping/constants.js";
import ReservationsPage from "@/modules/reservations/ReservationsPage.jsx";
import { RESERVATIONS_ROUTE_PATH } from "@/modules/reservations/constants.js";
import SettingsPage from "@/modules/settings/SettingsPage.jsx";
import { SETTINGS_ROUTE_PATH } from "@/modules/settings/constants.js";
import ReportsPage from "@/modules/reports/ReportsPage.jsx";
import { REPORTS_ROUTE_PATH } from "@/modules/reports/constants.js";

// Each nested `path` below is its module's own ROUTE_PATH with the leading
// "/" stripped, since react-router wants a relative segment for children of
// AdminShell — the absolute constant (used by NavLink/Navigate/redirects
// elsewhere) stays the single source of truth.
const asChildPath = (routePath) => routePath.slice(1);

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
              { index: true, element: <Navigate to={DASHBOARD_ROUTE_PATH} replace /> },
              { path: asChildPath(DASHBOARD_ROUTE_PATH), element: <DashboardPage /> },
              { path: asChildPath(ROOMS_ROUTE_PATH), element: <RoomsSetupPage /> },
              { path: asChildPath(HOUSEKEEPING_ROUTE_PATH), element: <HousekeepingPage /> },
              { path: asChildPath(RESERVATIONS_ROUTE_PATH), element: <ReservationsPage /> },
              { path: asChildPath(SETTINGS_ROUTE_PATH), element: <SettingsPage /> },
              { path: asChildPath(REPORTS_ROUTE_PATH), element: <ReportsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
