import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, StickyNote } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { Badge } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import { bookingStaySummariesKey } from "@/modules/reservations/constants.js";

// The month grid can't fit every booking touching a busy day inline — this
// is where "+N more" (and a plain day-cell click) lands: every booking
// touching that calendar day, with enough detail (phone, notes, paid/
// balance) for one staff member to hand a booking off to the next shift
// without having to open it, and a tap-through into the same Manage Stay
// workspace the Dashboard's room board uses (check-in/out, billing, cancel).
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
        {bookings.map((b) => {
          const Row = onSelectBooking ? "button" : "div";
          const summary = summaries?.[b.id];
          return (
            <Row
              key={b.id}
              type={onSelectBooking ? "button" : undefined}
              onClick={onSelectBooking ? () => onSelectBooking(b) : undefined}
              className={`block w-full rounded-lg border border-line bg-card p-3 text-left shadow-sm ${
                onSelectBooking ? "transition hover:border-brand" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                  {b.guest.name} · Room {b.room.roomNumber}
                </p>
                <Badge color={b.status.color}>{b.status.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatDateTime(b.checkIn)} → {formatDateTime(b.checkOut)}
              </p>
              {b.guest.phone && (
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Phone className="h-3 w-3 shrink-0" />
                  {b.guest.phone}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-2 py-1.5 text-xs">
                <span className="text-gray-500">
                  Total <span className="font-semibold text-gray-900">{formatCurrency(summary ? summary.grandTotal : b.totalAmount)}</span>
                </span>
                <span className="text-gray-500">
                  Paid <span className="font-semibold text-gray-900">{summary ? formatCurrency(summary.advancePaid) : "…"}</span>
                </span>
                {summary && (
                  <span className={`font-semibold ${summary.balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {summary.balanceDue > 0 ? `Balance due ${formatCurrency(summary.balanceDue)}` : "Fully paid"}
                  </span>
                )}
              </div>
              {b.notes && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md bg-gold-tint px-2 py-1.5 text-xs text-gray-700">
                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-gold-dark" />
                  {b.notes}
                </p>
              )}
            </Row>
          );
        })}
      </div>
    </Modal>
  );
}
