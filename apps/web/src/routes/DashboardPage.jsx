import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen, Wallet, AlertTriangle, CreditCard, CalendarOff, Plus, Search } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { toISODate, rangeFor } from "../lib/dateRange.js";
import { formatCurrency } from "../lib/format.js";
import StatCard from "../components/StatCard.jsx";
import RoomBoardCard from "../components/RoomBoardCard.jsx";
import BookingFormModal from "../components/BookingFormModal.jsx";
import RoomBookingsModal from "../components/RoomBookingsModal.jsx";
import RoomClosuresModal from "../components/RoomClosuresModal.jsx";
import { Button, Chip, Input, SegmentedControl, CardSkeleton } from "../ui/index.js";
import { useAuthStore } from "../store/authStore.js";

const VIEW_MODES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];
const BUCKETS = [
  { code: "available", label: "Available" },
  { code: "occupied", label: "Occupied" },
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
  const [floorFilter, setFloorFilter] = useState(null);
  const [bucketFilter, setBucketFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [bookingModal, setBookingModal] = useState(null); // { roomId } | null
  const [roomBookingsModal, setRoomBookingsModal] = useState(null); // { id, roomNumber } | null
  const [closuresOpen, setClosuresOpen] = useState(false);

  const dateISO = toISODate(selectedDate);

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary", dateISO],
    queryFn: () => apiFetch(`/dashboard/summary?date=${dateISO}`),
  });

  const { data: board, isLoading } = useQuery({
    queryKey: ["dashboard-room-board", dateISO, floorFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({ date: dateISO });
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
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hotel Dashboard</h1>
          <p className="text-sm text-gray-500">
            {selectedDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} ·{" "}
            {board?.length ? Math.round((bucketCounts.occupied / board.length) * 100) : 0}% occupancy · live from front desk
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DoorOpen}
          label="Rooms open tonight"
          value={`${bucketCounts.available} / ${board?.length ?? 0} rooms`}
          sublabel={
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-blue-500"
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
                {summary?.needsAttention.overdue ?? 0} <span className="text-xs font-normal text-gray-500">Overdue</span>
              </span>
              <span>
                {summary?.needsAttention.checkOuts ?? 0} <span className="text-xs font-normal text-gray-500">Check-outs</span>
              </span>
              <span>
                {summary?.needsAttention.dirty ?? 0} <span className="text-xs font-normal text-gray-500">Dirty</span>
              </span>
            </span>
          }
        />
        <StatCard
          icon={CreditCard}
          label="Room payments — today"
          value={formatCurrency(summary?.roomPaymentsToday.total)}
          sublabel={(summary?.roomPaymentsToday.byMethod ?? []).map((m) => `${m.name} ${formatCurrency(m.amount)}`).join(" · ")}
        />
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-gray-900">Room status</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {BUCKETS.map((b) => (
            <button
              key={b.code}
              onClick={() => setBucketFilter(bucketFilter === b.code ? null : b.code)}
              className={`rounded-lg border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                bucketFilter === b.code ? "border-brand ring-1 ring-brand" : "border-gray-200"
              }`}
            >
              <p className="text-xs uppercase text-gray-500">{b.label}</p>
              <p className="text-lg font-semibold text-gray-900">{bucketCounts[b.code] ?? 0}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <CardSkeleton count={10} />
        </div>
      )}

      {roomsByFloor.map(([floor, rooms]) => (
        <div key={floor} className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
        <BookingFormModal defaultRoomId={bookingModal.roomId} defaultDate={selectedDate} onClose={() => setBookingModal(null)} />
      )}
      {roomBookingsModal && <RoomBookingsModal room={roomBookingsModal} onClose={() => setRoomBookingsModal(null)} />}
      {closuresOpen && <RoomClosuresModal onClose={() => setClosuresOpen(false)} />}
    </div>
  );
}
