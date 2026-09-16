import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuthStore } from "../store/authStore.js";

const NEEDS_ATTENTION_CODES = new Set(["dirty", "cleaning", "maintenance"]);

export default function HousekeepingPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const { data: rooms, isLoading, error } = useQuery({ queryKey: ["rooms"], queryFn: () => apiFetch("/rooms") });
  const { data: roomStatuses } = useQuery({ queryKey: ["statuses", "room"], queryFn: () => apiFetch("/statuses?domain=room") });

  const availableStatus = roomStatuses?.find((s) => s.isDefault) ?? roomStatuses?.find((s) => s.code === "available");

  const tasks = useMemo(() => (rooms ?? []).filter((r) => NEEDS_ATTENTION_CODES.has(r.status.code)), [rooms]);

  const markAvailable = useMutation({
    mutationFn: (roomId) => apiFetch(`/rooms/${roomId}/status`, { method: "PATCH", body: JSON.stringify({ statusId: availableStatus.id }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
    },
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Housekeeping Tasks</h1>
        <p className="text-sm text-gray-500">Rooms that need cleaning or maintenance before they can be sold again.</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {tasks.length === 0 && !isLoading ? (
        <p className="mt-16 text-center text-sm text-gray-400">All rooms are clean! Great job. 🌟</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((room) => (
            <div key={room.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Room {room.roomNumber}</p>
                  <p className="text-xs text-gray-500">
                    {room.roomType.name}
                    {room.floor ? ` · Floor ${room.floor}` : ""}
                  </p>
                </div>
                <StatusBadge label={room.status.label} color={room.status.color} />
              </div>

              {permissions.has("rooms.housekeeping") && availableStatus && (
                <button
                  onClick={() => markAvailable.mutate(room.id)}
                  disabled={markAvailable.isPending}
                  className="btn-brand mt-3 w-full rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Mark available
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
