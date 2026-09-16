import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { rangeFor, addDays, startOfMonth, toISODate } from "../lib/dateRange.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import BookingFormModal from "../components/BookingFormModal.jsx";
import RecordPaymentModal from "../components/RecordPaymentModal.jsx";
import { useAuthStore } from "../store/authStore.js";

const VIEW_MODES = ["day", "week", "month"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_LANES = 4;

function layoutWeek(bookings, weekStart) {
  const weekEnd = addDays(weekStart, 7);
  const touching = bookings
    .filter((b) => new Date(b.checkIn) < weekEnd && new Date(b.checkOut) > weekStart)
    .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

  const lanes = []; // lanes[i] = end-day-index of the last booking placed in that lane
  const placed = [];
  const overflow = [];

  for (const booking of touching) {
    const startCol = Math.max(0, Math.floor((new Date(booking.checkIn) - weekStart) / 86400000));
    const endCol = Math.min(7, Math.ceil((new Date(booking.checkOut) - weekStart) / 86400000));
    let lane = lanes.findIndex((laneEnd) => laneEnd <= startCol);
    if (lane === -1) lane = lanes.length;

    if (lane >= MAX_LANES) {
      overflow.push(booking);
      continue;
    }
    lanes[lane] = endCol;
    placed.push({ booking, startCol, endCol, lane });
  }

  return { placed, overflowCount: overflow.length };
}

export default function ReservationsPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [bookingModal, setBookingModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null);

  const { start, end } = rangeFor(viewMode, anchorDate);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["bookings", toISODate(start), toISODate(end), search],
    queryFn: () => {
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      if (search) params.set("search", search);
      return apiFetch(`/bookings?${params.toString()}`);
    },
  });

  const { data: bookingStatuses } = useQuery({ queryKey: ["statuses", "booking"], queryFn: () => apiFetch("/statuses?domain=booking") });
  const statusByCode = useMemo(() => Object.fromEntries((bookingStatuses ?? []).map((s) => [s.code, s])), [bookingStatuses]);

  const transitionStatus = useMutation({
    mutationFn: ({ bookingId, statusId, extra }) =>
      apiFetch(`/bookings/${bookingId}/status`, { method: "PATCH", body: JSON.stringify({ statusId, ...extra }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });

  function shift(deltaWeeks) {
    if (viewMode === "day") setAnchorDate(addDays(anchorDate, deltaWeeks));
    else if (viewMode === "week") setAnchorDate(addDays(anchorDate, deltaWeeks * 7));
    else {
      const d = new Date(anchorDate);
      d.setMonth(d.getMonth() + deltaWeeks);
      setAnchorDate(d);
    }
  }

  const weeks = useMemo(() => {
    if (viewMode !== "month") return [];
    const result = [];
    for (let d = new Date(start); d < end; d = addDays(d, 7)) result.push(new Date(d));
    return result;
  }, [start, end, viewMode]);

  const currentMonth = startOfMonth(anchorDate).getMonth();

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Room Reservations</h1>
          <p className="text-sm text-gray-500">{anchorDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
        </div>
        {permissions.has("bookings.create") && (
          <button onClick={() => setBookingModal(true)} className="btn-brand rounded-md px-3 py-2 text-sm font-medium text-white">
            + New Booking
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchorDate(new Date())} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            Today
          </button>
          <button onClick={() => shift(-1)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            ‹
          </button>
          <button onClick={() => shift(1)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            ›
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest / room"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium capitalize ${
                viewMode === mode ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading bookings…</p>}

      {viewMode === "month" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((weekStart) => {
            const { placed, overflowCount } = layoutWeek(bookings ?? [], weekStart);
            const lanesUsed = Math.max(1, ...placed.map((p) => p.lane + 1), overflowCount > 0 ? 1 : 0);

            return (
              <div key={weekStart.toISOString()} className="grid grid-cols-7 border-b border-gray-100" style={{ minHeight: `${28 + lanesUsed * 24}px` }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = addDays(weekStart, i);
                  const inMonth = day.getMonth() === currentMonth;
                  const isToday = toISODate(day) === toISODate(new Date());
                  return (
                    <div key={i} className={`border-r border-gray-100 p-1 ${inMonth ? "" : "bg-gray-50 text-gray-300"}`}>
                      <span className={`text-xs ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 font-semibold text-white" : "text-gray-500"}`}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}

                <div className="col-span-7 -mt-6 grid grid-cols-7 gap-y-[2px] px-1">
                  {placed.map(({ booking, startCol, endCol, lane }) => (
                    <button
                      key={booking.id}
                      onClick={() => permissions.has("payments.record") && setPaymentModal(booking)}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold text-white"
                      style={{
                        gridColumnStart: startCol + 1,
                        gridColumnEnd: endCol + 1,
                        gridRow: lane + 1,
                        backgroundColor: booking.status.color,
                        marginTop: `${lane * 20}px`,
                      }}
                      title={`${booking.guest.name} · Room ${booking.room.roomNumber} · ${booking.status.label}`}
                    >
                      {booking.guest.name} · {booking.room.roomNumber}
                    </button>
                  ))}
                  {overflowCount > 0 && <span className="col-span-7 px-1 text-[10px] text-gray-500">+{overflowCount} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode !== "month" && (
        <div className="space-y-2">
          {(bookings ?? []).length === 0 && <p className="text-sm text-gray-500">No bookings in this range.</p>}
          {bookings?.map((booking) => (
            <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {booking.guest.name} · Room {booking.room.roomNumber}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)} · {formatCurrency(booking.totalAmount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${booking.status.color}1a`, color: booking.status.color }}>
                  {booking.status.label}
                </span>
                {permissions.has("bookings.edit") && booking.status.code === "confirmed" && statusByCode.checked_in && (
                  <button
                    onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.checked_in.id, extra: { actualCheckIn: new Date().toISOString() } })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium"
                  >
                    Check in
                  </button>
                )}
                {permissions.has("bookings.edit") && booking.status.code === "checked_in" && statusByCode.checked_out && (
                  <button
                    onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.checked_out.id, extra: { actualCheckOut: new Date().toISOString() } })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium"
                  >
                    Check out
                  </button>
                )}
                {permissions.has("bookings.cancel") && !booking.status.isTerminal && statusByCode.cancelled && (
                  <button
                    onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.cancelled.id })}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600"
                  >
                    Cancel
                  </button>
                )}
                {permissions.has("payments.record") && (
                  <button onClick={() => setPaymentModal(booking)} className="btn-brand rounded-md px-2 py-1 text-xs font-medium text-white">
                    Record payment
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {bookingModal && <BookingFormModal defaultDate={anchorDate} onClose={() => setBookingModal(false)} />}
      {paymentModal && permissions.has("payments.record") && <RecordPaymentModal booking={paymentModal} onClose={() => setPaymentModal(null)} />}
    </div>
  );
}
