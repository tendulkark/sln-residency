import { ReceiptText } from "lucide-react";

// Reports module constants — its route, sidebar nav entry, and the React
// Query cache keys for each report tab (Bookings/Revenue/Occupancy/GST).
export const REPORTS_ROUTE_PATH = "/reports";

export const REPORTS_NAV_ITEM = {
  to: REPORTS_ROUTE_PATH,
  label: "Reports",
  permission: "reports.view",
  icon: ReceiptText,
};

export const REPORTS_BOOKINGS_QUERY_KEY = "reports-bookings";
export const REPORTS_REVENUE_QUERY_KEY = "reports-revenue";
export const REPORTS_OCCUPANCY_QUERY_KEY = "reports-occupancy";
export const REPORTS_GST_QUERY_KEY = "reports-gst";
