import { createBrowserRouter, Navigate } from "react-router-dom";
import RootLayout from "./routes/RootLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import Login from "./routes/Login.jsx";
import AdminShell from "./routes/AdminShell.jsx";
import RoomsPage from "./routes/RoomsPage.jsx";

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
              { index: true, element: <Navigate to="/rooms" replace /> },
              { path: "rooms", element: <RoomsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
