import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function RoomsPage() {
  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => apiFetch("/rooms"),
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Rooms</h1>
        <p className="text-sm text-gray-500">Live status across all rooms.</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading rooms…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {rooms && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Room {room.roomNumber}</p>
                  <p className="text-xs text-gray-500">{room.roomType.name}{room.floor ? ` · Floor ${room.floor}` : ""}</p>
                </div>
              </div>
              <div className="mt-3">
                <StatusBadge label={room.status.label} color={room.status.color} />
              </div>
            </div>
          ))}
        </div>
      )}

      {rooms && rooms.length === 0 && (
        <p className="text-sm text-gray-500">No rooms yet — add some from Settings once that's built.</p>
      )}
    </div>
  );
}
