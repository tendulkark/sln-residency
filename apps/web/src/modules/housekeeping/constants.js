import { Sparkles } from "lucide-react";

// Housekeeping module constants — its route, sidebar nav entry, and the
// React Query cache key for room closures (maintenance/renovation blocks).
export const HOUSEKEEPING_ROUTE_PATH = "/housekeeping";

export const HOUSEKEEPING_NAV_ITEM = {
  to: HOUSEKEEPING_ROUTE_PATH,
  label: "Housekeeping",
  permission: "rooms.housekeeping",
  icon: Sparkles,
};

export const ROOM_CLOSURES_QUERY_KEY = "room-closures";
