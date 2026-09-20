import { addDays } from "@/lib/dateRange.js";

// Shared by the Month/Week grids and the Day sheet — a day's occupied-room
// count relative to the hotel's total room count, colored so a glance
// across any of the three views spots busy days. Thresholds are a display
// convenience, not tenant-configurable data.
export function occupancyTone(occupied, total) {
  if (total <= 0) return "bg-muted-strong text-gray-500";
  const pct = occupied / total;
  if (pct >= 0.9) return "bg-red-100 text-red-700";
  if (pct >= 0.6) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

// Every booking whose [checkIn, checkOut) span touches this calendar day.
export function bookingsForDay(bookings, day) {
  const dayEnd = addDays(day, 1);
  return bookings.filter((b) => new Date(b.checkIn) < dayEnd && new Date(b.checkOut) > day);
}

// Rooms actually occupying a day, out of a list already narrowed to that
// day (bookingsForDay) — cancelled/no-show bookings never used the room,
// so they're excluded from occupancy counts (but still listed in
// day-detail views).
export function occupiedRoomIds(dayBookings) {
  return new Set(dayBookings.filter((b) => b.status.code !== "cancelled" && b.status.code !== "no_show").map((b) => b.room.id));
}
