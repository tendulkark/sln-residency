import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api.js";
import Modal from "@/ui/Dialog.jsx";
import BookingRow from "@/modules/reservations/BookingRow.jsx";
import { bookingStaySummariesKey } from "@/modules/reservations/constants.js";

// The month/week grids can't fit every booking touching a busy day inline —
// this is where "+N more" (and a plain day-cell click) lands: every
// booking touching that calendar day, with enough detail (phone, notes,
// paid/balance) for one staff member to hand a booking off to the next
// shift without having to open it, and a tap-through into the same Manage
// Stay workspace the Dashboard's room board and the Day sheet use.
export default function DayBookingsModal({ date, bookings, onSelectBooking, onClose }) {
  const ids = useMemo(() => bookings.map((b) => b.id), [bookings]);
  // A group booking's sibling rooms are billed as one stay — the server
  // computes each distinct stay once and fans the same paid/balance figures
  // back out to every room's id, same as Manage Stay would show for any of
  // them.
  const { data: summaries } = useQuery({
    queryKey: bookingStaySummariesKey(ids),
    queryFn: () => apiFetch(`/bookings/stay-summaries?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
  });

  return (
    <Modal title={date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} onClose={onClose}>
      {bookings.length === 0 && <p className="text-sm text-gray-500">No bookings touch this day.</p>}
      <div className="space-y-2">
        {bookings.map((b) => (
          <BookingRow key={b.id} booking={b} summary={summaries?.[b.id]} onClick={onSelectBooking ? () => onSelectBooking(b) : undefined} />
        ))}
      </div>
    </Modal>
  );
}
