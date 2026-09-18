import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Settings, ImageOff } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrency } from "@/lib/format.js";
import StatusBadge from "@/modules/common/StatusBadge.jsx";
import RoomFormModal from "@/modules/rooms/RoomFormModal.jsx";
import RoomTypesModal from "@/modules/rooms/RoomTypesModal.jsx";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Button, CardSkeleton, EmptyState, Menu, PageHeader } from "@/ui/index.js";
import { ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";

export default function RoomsSetupPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const { data: rooms, isLoading, error } = useQuery({ queryKey: [ROOMS_QUERY_KEY], queryFn: () => apiFetch("/rooms") });

  const [roomModal, setRoomModal] = useState(null); // "new" | room | null
  const [roomTypesOpen, setRoomTypesOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] }),
  });

  return (
    <div>
      <PageHeader
        title="Hotel Rooms Setup"
        subtitle="Manage rooms, amenities and pricing."
        actions={
          <>
            {permissions.has("roomtypes.edit") && (
              <Button variant="outline" onClick={() => setRoomTypesOpen(true)}>
                <Settings className="h-4 w-4" />
                Manage Room Types
              </Button>
            )}
            {permissions.has("rooms.edit") && (
              <Button onClick={() => setRoomModal("new")}>
                <Plus className="h-4 w-4" />
                Add Room
              </Button>
            )}
          </>
        }
      />

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {isLoading && <CardSkeleton count={10} />}
        {rooms?.map((room) => (
          <div key={room.id} className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            <div className="flex h-24 items-center justify-center gap-1.5 bg-muted text-xs text-gray-400">
              <ImageOff className="h-4 w-4" />
              No photo
            </div>
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
                  <Menu
                    items={[
                      { label: "Edit", icon: Pencil, onClick: () => setRoomModal(room) },
                      { label: "Delete", icon: Trash2, tone: "danger", onClick: () => deleteMutation.mutate(room.id) },
                    ]}
                  />
                )}
              </div>

              <p className="mt-2 text-xs text-gray-500">{(room.roomType.amenities ?? []).join(", ") || "No amenities listed"}</p>

              <p className="mt-2 text-xs text-gray-500">
                Base {formatCurrency(room.pricing.basePrice)} · CGST {formatCurrency(room.pricing.cgst)} · SGST {formatCurrency(room.pricing.sgst)} · GST{" "}
                {room.pricing.ratePercent}%
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(room.pricing.total)}/night</p>

              <div className="mt-3">
                <StatusBadge label={room.status.label} color={room.status.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {rooms && rooms.length === 0 && (
        <EmptyState icon={ImageOff} title="No rooms yet" subtitle="Add one above to get started." />
      )}

      {roomModal && <RoomFormModal room={roomModal === "new" ? null : roomModal} onClose={() => setRoomModal(null)} />}
      {roomTypesOpen && <RoomTypesModal onClose={() => setRoomTypesOpen(false)} />}
    </div>
  );
}
