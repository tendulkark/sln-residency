import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search, CalendarX2 } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { rangeFor, addDays, startOfMonth, toISODate } from "../lib/dateRange.js";
import { formatCurrency, formatDateTime } from "../lib/format.js";
import BookingFormModal from "../components/BookingFormModal.jsx";
import RecordPaymentModal from "../components/RecordPaymentModal.jsx";
import { useAuthStore } from "../store/authStore.js";
import { Badge, Button, CardSkeleton, EmptyState, Input, SegmentedControl, PageHeader } from "../ui/index.js";

const VIEW_MODES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
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
      <PageHeader
        title="Room Reservations"
        subtitle={anchorDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        actions={
          permissions.has("bookings.create") && (
            <Button onClick={() => setBookingModal(true)}>
              <Plus className="h-4 w-4" />
              New Booking
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="w-56">
            <Input icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest / room" />
          </div>
        </div>
        <SegmentedControl options={VIEW_MODES} value={viewMode} onChange={setViewMode} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3">
          <CardSkeleton count={4} />
        </div>
      )}

      {viewMode === "month" && !isLoading && (
        // Seven fixed columns don't shrink to a phone width — scroll
        // horizontally instead of squeezing every cell unreadable.
        <div className="overflow-x-auto rounded-xl border border-line bg-card shadow-sm">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 border-b border-line bg-muted">
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
                <div key={weekStart.toISOString()} className="grid grid-cols-7 border-b border-line-soft" style={{ minHeight: `${28 + lanesUsed * 24}px` }}>
                  {Array.from({ length: 7 }).map((_, i) => {
                    const day = addDays(weekStart, i);
                    const inMonth = day.getMonth() === currentMonth;
                    const isToday = toISODate(day) === toISODate(new Date());
                    return (
                      <div key={i} className={`border-r border-line-soft p-1 ${inMonth ? "" : "bg-muted text-gray-300"}`}>
                        <span className={`text-xs ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand font-semibold text-white" : "text-gray-500"}`}>
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
        </div>
      )}

      {viewMode !== "month" && !isLoading && (
        <div className="space-y-2">
          {(bookings ?? []).length === 0 && <EmptyState icon={CalendarX2} title="No bookings in this range." />}
          {bookings?.map((booking) => (
            <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {booking.guest.name} · Room {booking.room.roomNumber}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(booking.checkIn)} → {formatDateTime(booking.checkOut)} · {formatCurrency(booking.totalAmount)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={booking.status.color}>{booking.status.label}</Badge>
                {permissions.has("bookings.edit") && booking.status.code === "confirmed" && statusByCode.checked_in && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.checked_in.id, extra: { actualCheckIn: new Date().toISOString() } })}
                  >
                    Check in
                  </Button>
                )}
                {permissions.has("bookings.edit") && booking.status.code === "checked_in" && statusByCode.checked_out && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.checked_out.id, extra: { actualCheckOut: new Date().toISOString() } })}
                  >
                    Check out
                  </Button>
                )}
                {permissions.has("bookings.cancel") && !booking.status.isTerminal && statusByCode.cancelled && (
                  <Button variant="danger" size="sm" onClick={() => transitionStatus.mutate({ bookingId: booking.id, statusId: statusByCode.cancelled.id })}>
                    Cancel
                  </Button>
                )}
                {permissions.has("payments.record") && (
                  <Button size="sm" onClick={() => setPaymentModal(booking)}>
                    Record payment
                  </Button>
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
