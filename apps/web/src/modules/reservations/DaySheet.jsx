import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogIn, BedDouble, LogOut, Ban, CalendarX2, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { toISODate } from "@/lib/dateRange.js";
import { EmptyState } from "@/ui/index.js";
import BookingRow from "@/modules/reservations/BookingRow.jsx";
import { bookingStaySummariesKey } from "@/modules/reservations/constants.js";
import { bookingsForDay, occupancyTone, occupiedRoomIds } from "@/modules/reservations/calendarUtils.js";

function StatPill({ label, value, tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
      <span className="text-sm">{value}</span>
    </span>
  );
}

// Collapsible by default expanded — a busy Arrivals/In-House list can run
// long, and once a section's been dealt with (or isn't relevant right now)
// collapsing it down to just its header keeps the rest of the day sheet
// scannable without losing the count.
function DaySection({ title, icon: Icon, bookings, summaries, onSelectBooking, emptyText, tagFor, muted }) {
  const [open, setOpen] = useState(true);
  if (bookings.length === 0 && !emptyText) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`mb-2 flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${muted ? "text-gray-400" : "text-brand/75"}`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
        <span className="font-medium normal-case text-gray-400">({bookings.length})</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open &&
        (bookings.length === 0 ? (
          <p className="text-xs text-gray-400">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <BookingRow key={b.id} booking={b} summary={summaries?.[b.id]} onClick={() => onSelectBooking(b)} tag={tagFor?.(b)} />
            ))}
          </div>
        ))}
    </div>
  );
}

// The Day view: a genuine front-desk day sheet, not just a filtered list —
// sectioned into Arrivals (expected in, not yet checked in), In-House
// (checked in, currently occupying a room), and Departures (checked out
// today), the same three buckets a hotel's front desk works from. Every
// row opens the same Manage Stay workspace the Dashboard and the month/
// week day-detail popover use, so check-in/out, billing, and cancel all
// live in one place regardless of which screen you started from.
export default function DaySheet({ date, bookings, totalRooms, bookingStatuses, onSelectBooking }) {
  const todayIso = toISODate(date);
  const dayBookings = useMemo(
    () => bookingsForDay(bookings, date).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn)),
    [bookings, date]
  );
  const ids = useMemo(() => dayBookings.map((b) => b.id), [dayBookings]);

  const { data: summaries } = useQuery({
    queryKey: bookingStaySummariesKey(ids),
    queryFn: () => apiFetch(`/bookings/stay-summaries?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
  });

  const arrivals = dayBookings.filter((b) => !b.status.isTerminal && b.status.code !== "checked_in");
  const inHouse = dayBookings.filter((b) => b.status.code === "checked_in");
  const departures = dayBookings.filter((b) => b.status.code === "checked_out" && b.actualCheckOut && toISODate(b.actualCheckOut) === todayIso);
  const other = dayBookings.filter((b) => b.status.code === "cancelled" || b.status.code === "no_show");

  const occupied = occupiedRoomIds(dayBookings).size;

  if (dayBookings.length === 0) {
    return <EmptyState icon={CalendarX2} title="No bookings touch this day." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3 shadow-sm">
        {totalRooms > 0 && <StatPill label="Occupied" value={`${occupied}/${totalRooms}`} tone={occupancyTone(occupied, totalRooms)} />}
        <StatPill label="Arrivals" value={arrivals.length} tone="bg-amber-100 text-amber-700" />
        <StatPill label="In-house" value={inHouse.length} tone="bg-emerald-100 text-emerald-700" />
        <StatPill label="Departures" value={departures.length} tone="bg-gray-200 text-gray-700" />
        {bookingStatuses?.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {bookingStatuses.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <DaySection
        title="Arrivals"
        icon={LogIn}
        bookings={arrivals}
        summaries={summaries}
        onSelectBooking={onSelectBooking}
        emptyText="No arrivals expected today."
        tagFor={(b) => (toISODate(b.checkIn) < todayIso ? { text: "Overdue arrival", tone: "danger" } : null)}
      />

      <DaySection
        title="In-House"
        icon={BedDouble}
        bookings={inHouse}
        summaries={summaries}
        onSelectBooking={onSelectBooking}
        emptyText="No guests currently staying."
        tagFor={(b) => {
          const checkOutIso = toISODate(b.checkOut);
          if (checkOutIso < todayIso) return { text: "Overdue checkout", tone: "danger" };
          if (checkOutIso === todayIso) return { text: "Departing today", tone: "brand" };
          return null;
        }}
      />

      <DaySection
        title="Departures"
        icon={LogOut}
        bookings={departures}
        summaries={summaries}
        onSelectBooking={onSelectBooking}
        emptyText="No checkouts completed today."
      />

      {other.length > 0 && (
        <DaySection title="Cancelled / No-show" icon={Ban} bookings={other} summaries={summaries} onSelectBooking={onSelectBooking} muted />
      )}
    </div>
  );
}
