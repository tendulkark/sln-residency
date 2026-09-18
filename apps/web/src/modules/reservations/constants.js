import { CalendarDays } from "lucide-react";

// Reservations module constants — its route, sidebar nav entry, and the
// React Query cache keys used by ReservationsPage/BookingFormModal/
// ManageStayModal/ExtendStayModal/RoomBookingsModal/EditBookingModal.
export const RESERVATIONS_ROUTE_PATH = "/reservations";

export const RESERVATIONS_NAV_ITEM = {
  to: RESERVATIONS_ROUTE_PATH,
  label: "Reservations",
  permission: "bookings.view",
  icon: CalendarDays,
};

export const BOOKINGS_QUERY_KEY = "bookings";
export const bookingsKey = (...args) => [BOOKINGS_QUERY_KEY, ...args];
export const bookingsByRoomKey = (roomId) => [BOOKINGS_QUERY_KEY, "room", roomId];

export const BOOKING_STAY_QUERY_KEY = "booking-stay";
export const bookingStayKey = (bookingId) => [BOOKING_STAY_QUERY_KEY, bookingId];

export const GUESTS_QUERY_KEY = "guests";
export const guestsKey = (search) => [GUESTS_QUERY_KEY, search];
