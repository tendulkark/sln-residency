import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/format.js";
import StatusBadge from "../components/StatusBadge.jsx";
import RoomFormModal from "../components/RoomFormModal.jsx";
import RoomTypesModal from "../components/RoomTypesModal.jsx";
import { useAuthStore } from "../store/authStore.js";

export default function RoomsSetupPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const { data: rooms, isLoading, error } = useQuery({ queryKey: ["rooms"], queryFn: () => apiFetch("/rooms") });

  const [roomModal, setRoomModal] = useState(null); // "new" | room | null
  const [roomTypesOpen, setRoomTypesOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hotel Rooms Setup</h1>
          <p className="text-sm text-gray-500">Manage rooms, amenities and pricing.</p>
        </div>
        <div className="flex gap-2">
          {permissions.has("roomtypes.edit") && (
            <button onClick={() => setRoomTypesOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
              Manage Room Types
            </button>
          )}
          {permissions.has("rooms.edit") && (
            <button onClick={() => setRoomModal("new")} className="btn-brand rounded-md px-3 py-2 text-sm font-medium text-white">
              + Add Room
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading rooms…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {rooms?.map((room) => (
          <div key={room.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex h-24 items-center justify-center bg-gray-50 text-xs text-gray-400">No photo</div>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Room {room.roomNumber}</p>
                  <p className="text-xs text-gray-500">
                    {room.roomType.name}
                    {room.floor ? ` · Floor ${room.floor}` : ""}
                  </p>
                </div>
                {permissions.has("rooms.edit") && (
                  <div className="flex gap-2 text-gray-400">
                    <button onClick={() => setRoomModal(room)} title="Edit" className="hover:text-gray-700">
                      ✎
                    </button>
                    <button onClick={() => deleteMutation.mutate(room.id)} title="Delete" className="hover:text-red-600">
                      🗑
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500">{(room.roomType.amenities ?? []).join(", ") || "No amenities listed"}</p>

              <p className="mt-2 text-xs text-gray-500">
                Base {formatCurrency(room.pricing.basePrice)} · CGST {formatCurrency(room.pricing.cgst)} · SGST {formatCurrency(room.pricing.sgst)}
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(room.pricing.total)}/night</p>

              <div className="mt-3">
                <StatusBadge label={room.status.label} color={room.status.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {rooms && rooms.length === 0 && <p className="text-sm text-gray-500">No rooms yet — add one above.</p>}

      {roomModal && <RoomFormModal room={roomModal === "new" ? null : roomModal} onClose={() => setRoomModal(null)} />}
      {roomTypesOpen && <RoomTypesModal onClose={() => setRoomTypesOpen(false)} />}
    </div>
  );
}
