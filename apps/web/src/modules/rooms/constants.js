import { BedDouble } from "lucide-react";

// Rooms module constants — its route, sidebar nav entry, and the React
// Query cache keys used by RoomsSetupPage/RoomFormModal/RoomTypesModal.
export const ROOMS_ROUTE_PATH = "/rooms-setup";

export const ROOMS_NAV_ITEM = {
  to: ROOMS_ROUTE_PATH,
  label: "Rooms Setup",
  permission: "rooms.view",
  icon: BedDouble,
};

export const ROOMS_QUERY_KEY = "rooms";
export const roomsAvailableKey = (checkInIso, checkOutIso) => [ROOMS_QUERY_KEY, "available", checkInIso, checkOutIso];

export const ROOM_TYPES_QUERY_KEY = "room-types";
