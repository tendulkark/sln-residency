import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search, CalendarX2 } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { rangeFor, addDays, startOfMonth, toISODate } from "@/lib/dateRange.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import BookingFormModal from "@/modules/reservations/BookingFormModal.jsx";
import DayBookingsModal from "@/modules/reservations/DayBookingsModal.jsx";
import ManageStayModal from "@/modules/reservations/ManageStayModal.jsx";
import MonthYearPicker from "@/modules/reservations/MonthYearPicker.jsx";
import RecordPaymentModal from "@/modules/payments/RecordPaymentModal.jsx";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Badge, Button, CardSkeleton, EmptyState, Input, SegmentedControl, PageHeader } from "@/ui/index.js";
import { bookingsKey, BOOKINGS_QUERY_KEY } from "@/modules/reservations/constants.js";
import { statusesKey } from "@/modules/common/constants.js";
import { DASHBOARD_ROOM_BOARD_QUERY_KEY, DASHBOARD_SUMMARY_QUERY_KEY } from "@/modules/dashboard/constants.js";
import { ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";

const VIEW_MODES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A day's occupied-room count relative to the hotel's total room count,
// colored so a front-desk glance across the month spots busy days —
// thresholds are a display convenience, not tenant-configurable data.
function occupancyTone(occupied, total) {
  if (total <= 0) return "bg-muted-strong text-gray-500";
  const pct = occupied / total;
  if (pct >= 0.9) return "bg-red-100 text-red-700";
  if (pct >= 0.6) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

// Every booking whose [checkIn, checkOut) span touches this calendar day.
function bookingsForDay(bookings, day) {
  const dayEnd = addDays(day, 1);
  return bookings.filter((b) => new Date(b.checkIn) < dayEnd && new Date(b.checkOut) > day);
}

export default function ReservationsPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [bookingModal, setBookingModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null);
  const [manageBookingId, setManageBookingId] = useState(null);
  const [dayDetail, setDayDetail] = useState(null); // Date | null — the month grid's "+N more" / day-cell click

  const { start, end } = rangeFor(viewMode, anchorDate);

  const { data: bookings, isLoading } = useQuery({
    queryKey: bookingsKey(toISODate(start), toISODate(end), search),
    queryFn: () => {
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      if (search) params.set("search", search);
      return apiFetch(`/bookings?${params.toString()}`);
    },
  });

  const { data: bookingStatuses } = useQuery({ queryKey: statusesKey("booking"), queryFn: () => apiFetch("/statuses?domain=booking") });
  const statusByCode = useMemo(() => Object.fromEntries((bookingStatuses ?? []).map((s) => [s.code, s])), [bookingStatuses]);

  // Total room count is the denominator for each day's occupancy pill in
  // the month grid — only fetched when the viewer can actually see rooms,
  // and the pill itself just disappears otherwise rather than erroring.
  const { data: allRooms } = useQuery({
    queryKey: [ROOMS_QUERY_KEY],
    queryFn: () => apiFetch("/rooms"),
    enabled: permissions.has("rooms.view"),
  });
  const totalRooms = allRooms?.length ?? 0;

  const transitionStatus = useMutation({
    mutationFn: ({ bookingId, statusId, extra }) =>
      apiFetch(`/bookings/${bookingId}/status`, { method: "PATCH", body: JSON.stringify({ statusId, ...extra }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BOOKINGS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_ROOM_BOARD_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_SUMMARY_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {viewMode === "month" ? (
              <MonthYearPicker anchorDate={anchorDate} onSelect={setAnchorDate} />
            ) : (
              <span className="px-1 text-sm font-semibold text-gray-900">
                {anchorDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
        <div className="rounded-xl border border-line bg-card shadow-sm">
          {bookingStatuses?.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft px-3 py-2">
              {bookingStatuses.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {/* Seven fixed columns don't shrink to a phone width — scroll
              horizontally instead of squeezing every cell unreadable. */}
          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 border-b border-line bg-muted">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
                    {d}
                  </div>
                ))}
              </div>
              {weeks.map((weekStart) => (
                <div key={weekStart.toISOString()} className="grid grid-cols-7 border-b border-line-soft">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const day = addDays(weekStart, i);
                    const inMonth = day.getMonth() === currentMonth;
                    const isToday = toISODate(day) === toISODate(new Date());
                    const dayBookings = bookingsForDay(bookings ?? [], day).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
                    // Cancelled/no-show bookings never actually occupied the
                    // room, so they're excluded from the occupancy count
                    // (but still listed in the day's booking detail).
                    const occupiedRooms = new Set(
                      dayBookings.filter((b) => b.status.code !== "cancelled" && b.status.code !== "no_show").map((b) => b.room.id)
                    );
                    const visible = dayBookings.slice(0, 3);
                    const hiddenCount = dayBookings.length - visible.length;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => dayBookings.length > 0 && setDayDetail(day)}
                        className={`flex min-h-[108px] flex-col gap-1 border-r border-line-soft p-1.5 text-left last:border-r-0 ${
                          inMonth ? "bg-card hover:bg-muted" : "bg-muted/60"
                        } ${dayBookings.length === 0 ? "cursor-default" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                              isToday ? "bg-brand font-semibold text-white" : inMonth ? "text-gray-500" : "text-gray-300"
                            }`}
                          >
                            {day.getDate()}
                          </span>
                          {inMonth && totalRooms > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${occupancyTone(occupiedRooms.size, totalRooms)}`}>
                              {occupiedRooms.size}/{totalRooms}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {visible.map((b) => (
                            <span
                              key={b.id}
                              className="block truncate rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                              style={{ backgroundColor: b.status.color }}
                              title={`${b.guest.name} · Room ${b.room.roomNumber} · ${b.status.label}`}
                            >
                              {b.guest.name} · {b.room.roomNumber}
                            </span>
                          ))}
                          {hiddenCount > 0 && <span className="block text-[10px] font-semibold text-brand">+{hiddenCount} more</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
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
      {dayDetail && (
        <DayBookingsModal
          date={dayDetail}
          bookings={bookingsForDay(bookings ?? [], dayDetail).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))}
          onSelectBooking={(booking) => {
            setDayDetail(null);
            setManageBookingId(booking.id);
          }}
          onClose={() => setDayDetail(null)}
        />
      )}
      {manageBookingId && <ManageStayModal bookingId={manageBookingId} onClose={() => setManageBookingId(null)} />}
    </div>
  );
}
