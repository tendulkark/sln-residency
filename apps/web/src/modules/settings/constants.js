import { Settings } from "lucide-react";

// Settings module constants — its route, sidebar nav entry, and the React
// Query cache key for the tenant profile (also read by ProvisionalBillModal
// for the printed letterhead).
export const SETTINGS_ROUTE_PATH = "/settings";

export const SETTINGS_NAV_ITEM = {
  to: SETTINGS_ROUTE_PATH,
  label: "Settings",
  permission: "settings.manage",
  icon: Settings,
};

export const TENANT_QUERY_KEY = "tenant";
