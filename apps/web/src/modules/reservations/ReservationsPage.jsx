import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { rangeFor, addDays, startOfMonth, toISODate } from "@/lib/dateRange.js";
import BookingFormModal from "@/modules/reservations/BookingFormModal.jsx";
import DayBookingsModal from "@/modules/reservations/DayBookingsModal.jsx";
import DaySheet from "@/modules/reservations/DaySheet.jsx";
import ManageStayModal from "@/modules/reservations/ManageStayModal.jsx";
import MiniDatePicker from "@/modules/reservations/MiniDatePicker.jsx";
import MonthYearPicker from "@/modules/reservations/MonthYearPicker.jsx";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Button, CardSkeleton, Input, SegmentedControl, PageHeader } from "@/ui/index.js";
import { bookingsKey } from "@/modules/reservations/constants.js";
import { statusesKey } from "@/modules/common/constants.js";
import { ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";
import { bookingsForDay, occupancyTone, occupiedRoomIds } from "@/modules/reservations/calendarUtils.js";

const VIEW_MODES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "15 – 21 Sep 2026", expanding to show the month/year on both ends
// whenever the week crosses either boundary.
function weekRangeLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear();
  const startLabel = weekStart.toLocaleDateString("en-IN", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const endLabel = weekEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export default function ReservationsPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const [viewMode, setViewMode] = useState("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [bookingModal, setBookingModal] = useState(false);
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

  // Total room count is the denominator for each day's occupancy pill in
  // the month grid — only fetched when the viewer can actually see rooms,
  // and the pill itself just disappears otherwise rather than erroring.
  const { data: allRooms } = useQuery({
    queryKey: [ROOMS_QUERY_KEY],
    queryFn: () => apiFetch("/rooms"),
    enabled: permissions.has("rooms.view"),
  });
  const totalRooms = allRooms?.length ?? 0;

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

  const weekDays = useMemo(() => {
    if (viewMode !== "week") return [];
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [start, viewMode]);

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
            {viewMode === "month" && <MonthYearPicker anchorDate={anchorDate} onSelect={setAnchorDate} />}
            {viewMode === "week" && <MiniDatePicker label={weekRangeLabel(start)} anchorDate={anchorDate} onSelect={setAnchorDate} highlightWeek />}
            {viewMode === "day" && (
              <MiniDatePicker
                label={anchorDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                anchorDate={anchorDate}
                onSelect={setAnchorDate}
              />
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
                    const occupiedRooms = occupiedRoomIds(dayBookings);
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

      {viewMode === "week" && !isLoading && (
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
          {/* One row of seven columns, held to a fixed height so a busy day
              never grows the page itself — each column's own booking list
              scrolls internally instead (the day header stays put, visible
              the whole time you're scrolling it). */}
          <div className="overflow-x-auto">
            <div className="grid min-w-[840px] grid-cols-7">
              {weekDays.map((day) => {
                const isToday = toISODate(day) === toISODate(new Date());
                const dayBookings = bookingsForDay(bookings ?? [], day).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
                const occupiedRooms = occupiedRoomIds(dayBookings);

                return (
                  <div
                    key={day.toISOString()}
                    role="button"
                    tabIndex={0}
                    onClick={() => dayBookings.length > 0 && setDayDetail(day)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && dayBookings.length > 0) {
                        e.preventDefault();
                        setDayDetail(day);
                      }
                    }}
                    className={`flex h-[min(60vh,560px)] flex-col border-r border-line-soft text-left last:border-r-0 ${
                      dayBookings.length > 0 ? "cursor-pointer hover:bg-muted" : "cursor-default"
                    }`}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-line-soft p-2 pb-1.5">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{DAY_LABELS[day.getDay()]}</p>
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                            isToday ? "bg-brand font-semibold text-white" : "text-gray-700"
                          }`}
                        >
                          {day.getDate()}
                        </span>
                      </div>
                      {totalRooms > 0 && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${occupancyTone(occupiedRooms.size, totalRooms)}`}>
                          {occupiedRooms.size}/{totalRooms}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1 overflow-y-auto p-2 pt-1.5">
                      {dayBookings.map((b) => (
                        <span
                          key={b.id}
                          className="block truncate rounded px-1.5 py-1 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: b.status.color }}
                          title={`${b.guest.name} · Room ${b.room.roomNumber} · ${b.status.label}`}
                        >
                          {b.guest.name} · {b.room.roomNumber}
                        </span>
                      ))}
                      {dayBookings.length === 0 && <p className="text-[11px] text-gray-300">No bookings</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === "day" && !isLoading && (
        <DaySheet
          date={anchorDate}
          bookings={bookings ?? []}
          totalRooms={totalRooms}
          bookingStatuses={bookingStatuses}
          onSelectBooking={(booking) => setManageBookingId(booking.id)}
        />
      )}

      {bookingModal && <BookingFormModal defaultDate={anchorDate} onClose={() => setBookingModal(false)} />}
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
