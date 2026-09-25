import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen, Wallet, AlertTriangle, CreditCard, CalendarOff, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { toISODate, rangeFor } from "@/lib/dateRange.js";
import { formatCurrency, toTimeInputValue } from "@/lib/format.js";
import StatCard from "@/modules/dashboard/components/StatCard.jsx";
import RoomBoardCard from "@/modules/dashboard/components/RoomBoardCard.jsx";
import BookingFormModal from "@/modules/reservations/components/BookingFormModal.jsx";
import RoomBookingsModal from "@/modules/reservations/components/RoomBookingsModal.jsx";
import RoomClosuresModal from "@/modules/housekeeping/components/RoomClosuresModal.jsx";
import { Button, Chip, Input, SegmentedControl, CardSkeleton, PageHeader } from "@/ui/index.js";
import { useAuthStore } from "@/app/authStore.js";
import { dashboardSummaryKey, dashboardRoomBoardKey, SYNTHETIC_BUCKET_COLOR } from "@/modules/dashboard/constants.js";

const VIEW_MODES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];
const BUCKETS = [
  { code: "available", label: "Available" },
  { code: "occupied", label: "Occupied" },
  { code: "overdue", label: "Overdue" },
  { code: "reserved", label: "Reserved" },
  { code: "dirty", label: "Dirty" },
  { code: "cleaning", label: "Cleaning" },
  { code: "maintenance", label: "Maintenance" },
  { code: "closed", label: "Closed" },
];

export default function DashboardPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const [viewMode, setViewMode] = useState("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(toTimeInputValue(new Date()));
  const [floorFilter, setFloorFilter] = useState(null);
  const [bucketFilter, setBucketFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [bookingModal, setBookingModal] = useState(null); // { roomId } | null
  const [roomBookingsModal, setRoomBookingsModal] = useState(null); // { id, roomNumber } | null
  const [closuresOpen, setClosuresOpen] = useState(false);

  const dateISO = toISODate(selectedDate);
  // What room-board/"Room status" answer — availability as of this exact
  // date+time, not just "sometime this calendar day". Bookings now carry
  // exact check-in/check-out timestamps (rolling 24h billing), so a room
  // freed up this morning and re-let tonight needs a point-in-time check
  // to show correctly, not a whole-day overlap check.
  const asOfDate = useMemo(() => {
    const [hours, minutes] = selectedTime.split(":").map(Number);
    const d = new Date(selectedDate);
    d.setHours(hours || 0, minutes || 0, 0, 0);
    return d;
  }, [selectedDate, selectedTime]);

  const { data: summary } = useQuery({
    queryKey: dashboardSummaryKey(dateISO),
    queryFn: () => apiFetch(`/dashboard/summary?date=${dateISO}`),
  });

  const { data: board, isLoading } = useQuery({
    queryKey: dashboardRoomBoardKey(dateISO, selectedTime, floorFilter, search),
    queryFn: () => {
      const params = new URLSearchParams({ date: dateISO, time: selectedTime });
      if (floorFilter) params.set("floor", floorFilter);
      if (search) params.set("search", search);
      return apiFetch(`/dashboard/room-board?${params.toString()}`);
    },
  });

  const floors = useMemo(() => [...new Set((board ?? []).map((r) => r.floor).filter(Boolean))].sort(), [board]);
  const bucketCounts = useMemo(() => {
    const counts = Object.fromEntries(BUCKETS.map((b) => [b.code, 0]));
    for (const room of board ?? []) counts[room.bucket] = (counts[room.bucket] ?? 0) + 1;
    return counts;
  }, [board]);

  // Each tile borrows the same color a room in that bucket already renders
  // with on the board below (or the synthetic reserved/closed color) —
  // never a new hardcoded status color, just reusing what the tenant's own
  // Status rows already say, so the summary strip and the room grid always
  // agree on what each color means.
  const bucketColors = useMemo(() => {
    const colors = {};
    for (const b of BUCKETS) {
      const room = (board ?? []).find((r) => r.bucket === b.code);
      colors[b.code] = SYNTHETIC_BUCKET_COLOR[b.code] ?? room?.roomStatus.color ?? "#9ca3af";
    }
    return colors;
  }, [board]);

  const filteredBoard = bucketFilter ? (board ?? []).filter((r) => r.bucket === bucketFilter) : board ?? [];
  const roomsByFloor = useMemo(() => {
    const map = new Map();
    for (const room of filteredBoard) {
      const key = room.floor ?? "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(room);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredBoard]);

  function shiftDate(mode) {
    const { start } = rangeFor(mode === "day" ? "day" : mode, selectedDate);
    return start;
  }

  return (
    <div>
      <PageHeader
        title="Hotel Dashboard"
        subtitle={`${asOfDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}, ${asOfDate.toLocaleTimeString(
          "en-IN",
          { hour: "numeric", minute: "2-digit" }
        )} · ${board?.length ? Math.round((bucketCounts.occupied / board.length) * 100) : 0}% occupancy as of this time`}
        actions={
          <>
            {permissions.has("roomclosures.manage") && (
              <Button variant="outline" onClick={() => setClosuresOpen(true)}>
                <CalendarOff className="h-4 w-4" />
                Closed periods
              </Button>
            )}
            {permissions.has("bookings.create") && (
              <Button onClick={() => setBookingModal({})}>
                <Plus className="h-4 w-4" />
                New booking
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DoorOpen}
          label="Rooms open tonight"
          value={`${bucketCounts.available} / ${board?.length ?? 0} rooms`}
          sublabel={
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted-strong">
              <div
                className="h-1.5 rounded-full bg-brand"
                style={{ width: `${board?.length ? (bucketCounts.available / board.length) * 100 : 0}%` }}
              />
            </div>
          }
        />
        <StatCard
          icon={Wallet}
          label="Tonight's revenue"
          value={formatCurrency(summary?.tonightsRevenue)}
          badge={summary?.revenueChangePercent != null ? `↑ ${summary.revenueChangePercent}%` : null}
          sublabel="Projected from confirmed stays"
        />
        <StatCard
          icon={AlertTriangle}
          label="Needs attention"
          tone="warn"
          value={
            <span className="flex gap-4 text-base">
              <span>
                {summary?.needsAttention.overdue ?? 0} <span className="text-xs font-normal text-ink-muted">Overdue</span>
              </span>
              <span>
                {summary?.needsAttention.checkOuts ?? 0} <span className="text-xs font-normal text-ink-muted">Check-outs</span>
              </span>
              <span>
                {summary?.needsAttention.dirty ?? 0} <span className="text-xs font-normal text-ink-muted">Dirty</span>
              </span>
            </span>
          }
        />
        <StatCard
          icon={CreditCard}
          label="Room payments — today"
          value={formatCurrency(summary?.roomPaymentsToday.total)}
          sublabel={[
            ...(summary?.roomPaymentsToday.byMethod ?? []).map((m) => `${m.name} ${formatCurrency(m.amount)}`),
            ...(summary?.roomPaymentsToday.refunds > 0 ? [`Refunds -${formatCurrency(summary.roomPaymentsToday.refunds)}`] : []),
          ].join(" · ")}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={VIEW_MODES}
            value={viewMode}
            onChange={(mode) => {
              setViewMode(mode);
              if (mode !== "custom") setSelectedDate(shiftDate(mode));
            }}
          />
          <input
            type="date"
            value={dateISO}
            onChange={(e) => {
              setSelectedDate(new Date(e.target.value));
              setViewMode("custom");
            }}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => {
              setSelectedTime(e.target.value);
              setViewMode("custom");
            }}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {floors.map((floor) => (
            <Chip key={floor} active={floorFilter === floor} onClick={() => setFloorFilter(floorFilter === floor ? null : floor)}>
              Floor {floor}
            </Chip>
          ))}
          <div className="w-48">
            <Input icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Room, guest or type" />
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-line bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand/75">
          Room status <span className="font-medium normal-case tracking-normal text-ink-muted">as of {asOfDate.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
          {BUCKETS.map((b) => {
            const color = bucketColors[b.code];
            const active = bucketFilter === b.code;
            return (
              <button
                key={b.code}
                onClick={() => setBucketFilter(active ? null : b.code)}
                aria-pressed={active}
                title={b.label}
                className="min-w-0 rounded-lg border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
                style={{
                  // Mixed over white rather than alpha over the cream page, for
                  // the same hue-fidelity reason as RoomBoardCard.
                  backgroundColor: `color-mix(in srgb, ${color} 11%, white)`,
                  borderColor: active ? color : `color-mix(in srgb, ${color} 40%, white)`,
                  boxShadow: active ? `0 0 0 2px ${color}` : undefined,
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {/* truncate: "Maintenance" is wider than a 3-across tile
                      on a 375px phone — clip it rather than let it spill. */}
                  <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
                    {b.label}
                  </span>
                </span>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{bucketCounts[b.code] ?? 0}</p>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CardSkeleton count={10} />
        </div>
      )}

      {roomsByFloor.map(([floor, rooms]) => (
        <div key={floor} className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">
            Floor {floor} · {rooms.length} rooms
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {rooms.map((room) => (
              <RoomBoardCard key={room.id} room={room} onClick={() => setRoomBookingsModal({ id: room.id, roomNumber: room.roomNumber })} />
            ))}
          </div>
        </div>
      ))}

      {bookingModal && (
        <BookingFormModal defaultRoomId={bookingModal.roomId} defaultDate={asOfDate} onClose={() => setBookingModal(null)} />
      )}
      {roomBookingsModal && <RoomBookingsModal room={roomBookingsModal} onClose={() => setRoomBookingsModal(null)} />}
      {closuresOpen && <RoomClosuresModal onClose={() => setClosuresOpen(false)} />}
    </div>
  );
}
