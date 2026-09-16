import { createBrowserRouter, Navigate } from "react-router-dom";
import RootLayout from "./routes/RootLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import Login from "./routes/Login.jsx";
import AdminShell from "./routes/AdminShell.jsx";
import DashboardPage from "./routes/DashboardPage.jsx";
import RoomsSetupPage from "./routes/RoomsSetupPage.jsx";
import HousekeepingPage from "./routes/HousekeepingPage.jsx";
import ReservationsPage from "./routes/ReservationsPage.jsx";
import SettingsPage from "./routes/SettingsPage.jsx";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AdminShell />,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              { path: "dashboard", element: <DashboardPage /> },
              { path: "rooms-setup", element: <RoomsSetupPage /> },
              { path: "housekeeping", element: <HousekeepingPage /> },
              { path: "reservations", element: <ReservationsPage /> },
              { path: "settings", element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
