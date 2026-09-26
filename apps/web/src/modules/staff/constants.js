import { Users } from "lucide-react";

// Staff module constants — its route, sidebar nav entry (Admin-only, gated
// on users.manage so Manager/Employee logins never even see the link), and
// its React Query cache keys.
export const STAFF_ROUTE_PATH = "/staff";

export const STAFF_NAV_ITEM = {
  to: STAFF_ROUTE_PATH,
  label: "Staff",
  permission: "users.manage",
  icon: Users,
};

export const USERS_QUERY_KEY = "users";
