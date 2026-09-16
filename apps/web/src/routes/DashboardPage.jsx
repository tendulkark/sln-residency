import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { toISODate, rangeFor } from "../lib/dateRange.js";
import { formatCurrency } from "../lib/format.js";
import StatCard from "../components/StatCard.jsx";
import RoomBoardCard from "../components/RoomBoardCard.jsx";
import BookingFormModal from "../components/BookingFormModal.jsx";
import RecordPaymentModal from "../components/RecordPaymentModal.jsx";
import RoomClosuresModal from "../components/RoomClosuresModal.jsx";
import { useAuthStore } from "../store/authStore.js";

const VIEW_MODES = ["day", "week", "month", "custom"];
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
  const [paymentModal, setPaymentModal] = useState(null); // booking | null
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
            <button onClick={() => setClosuresOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
              Closed periods
            </button>
          )}
          {permissions.has("bookings.create") && (
            <button onClick={() => setBookingModal({})} className="btn-brand rounded-md px-3 py-2 text-sm font-medium text-white">
              + New booking
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
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
          label="Tonight's revenue"
          value={formatCurrency(summary?.tonightsRevenue)}
          badge={summary?.revenueChangePercent != null ? `↑ ${summary.revenueChangePercent}%` : null}
          sublabel="Projected from confirmed stays"
        />
        <StatCard
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
              className={`rounded-lg border p-3 text-left ${bucketFilter === b.code ? "border-gray-900" : "border-gray-200"}`}
            >
              <p className="text-xs uppercase text-gray-500">{b.label}</p>
              <p className="text-lg font-semibold text-gray-900">{bucketCounts[b.code] ?? 0}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode);
                if (mode !== "custom") setSelectedDate(shiftDate(mode));
              }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium capitalize ${
                viewMode === mode ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              {mode}
            </button>
          ))}
          <input
            type="date"
            value={dateISO}
            onChange={(e) => {
              setSelectedDate(new Date(e.target.value));
              setViewMode("custom");
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2">
          {floors.map((floor) => (
            <button
              key={floor}
              onClick={() => setFloorFilter(floorFilter === floor ? null : floor)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                floorFilter === floor ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"
              }`}
            >
              Floor {floor}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Room, guest or type"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading rooms…</p>}

      {roomsByFloor.map(([floor, rooms]) => (
        <div key={floor} className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Floor {floor} · {rooms.length} rooms
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {rooms.map((room) => (
              <RoomBoardCard
                key={room.id}
                room={room}
                onClick={() => {
                  if (room.guest) setPaymentModal({ id: room.guest.bookingId, guest: room.guest, totalAmount: null });
                  else if (permissions.has("bookings.create")) setBookingModal({ roomId: room.id });
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {bookingModal && (
        <BookingFormModal defaultRoomId={bookingModal.roomId} defaultDate={selectedDate} onClose={() => setBookingModal(null)} />
      )}
      {paymentModal && permissions.has("payments.record") && (
        <RecordPaymentModal booking={paymentModal} onClose={() => setPaymentModal(null)} />
      )}
      {closuresOpen && <RoomClosuresModal onClose={() => setClosuresOpen(false)} />}
    </div>
  );
}
