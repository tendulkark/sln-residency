import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PartyPopper } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuthStore } from "../store/authStore.js";
import { Button, Card, CardSkeleton, EmptyState, PageHeader } from "../ui/index.js";

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
      <PageHeader title="Housekeeping Tasks" subtitle="Rooms that need cleaning or maintenance before they can be sold again." />

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton count={3} />
        </div>
      )}

      {tasks.length === 0 && !isLoading ? (
        <EmptyState icon={PartyPopper} title="All rooms are clean!" subtitle="Great job — nothing needs attention right now." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((room) => (
            <Card key={room.id}>
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
                <Button onClick={() => markAvailable.mutate(room.id)} disabled={markAvailable.isPending} className="mt-3 w-full">
                  Mark available
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
