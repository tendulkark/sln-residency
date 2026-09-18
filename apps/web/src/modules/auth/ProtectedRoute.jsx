import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { LOGIN_ROUTE_PATH } from "@/modules/auth/constants.js";

export default function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to={LOGIN_ROUTE_PATH} replace />;
  return <Outlet />;
}
