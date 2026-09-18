import { LayoutDashboard } from "lucide-react";

// Dashboard module constants — its route, sidebar nav entry, and the React
// Query cache keys its own queries use. AdminShell assembles the sidebar
// from every module's NAV_ITEM instead of hardcoding paths/labels itself.
export const DASHBOARD_ROUTE_PATH = "/dashboard";

export const DASHBOARD_NAV_ITEM = {
  to: DASHBOARD_ROUTE_PATH,
  label: "Hotel Dashboard",
  permission: "rooms.view",
  icon: LayoutDashboard,
};

export const DASHBOARD_SUMMARY_QUERY_KEY = "dashboard-summary";
export const dashboardSummaryKey = (dateISO) => [DASHBOARD_SUMMARY_QUERY_KEY, dateISO];

export const DASHBOARD_ROOM_BOARD_QUERY_KEY = "dashboard-room-board";
export const dashboardRoomBoardKey = (dateISO, time, floorFilter, search) => [
  DASHBOARD_ROOM_BOARD_QUERY_KEY,
  dateISO,
  time,
  floorFilter,
  search,
];
