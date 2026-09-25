import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, PartyPopper } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import StatusBadge from "@/modules/common/components/StatusBadge.jsx";
import { useAuthStore } from "@/app/authStore.js";
import { Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader } from "@/ui/index.js";
import { ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";
import { DASHBOARD_ROOM_BOARD_QUERY_KEY } from "@/modules/dashboard/constants.js";
import { statusesKey } from "@/modules/common/constants.js";

const NEEDS_ATTENTION_CODES = new Set(["dirty", "cleaning", "maintenance"]);

export default function HousekeepingPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const roomsQuery = useQuery({ queryKey: [ROOMS_QUERY_KEY], queryFn: () => apiFetch("/rooms") });
  const { data: rooms, isLoading } = roomsQuery;
  const [actionError, setActionError] = useState(null);
  const { data: roomStatuses } = useQuery({ queryKey: statusesKey("room"), queryFn: () => apiFetch("/statuses?domain=room") });

  const availableStatus = roomStatuses?.find((s) => s.isDefault) ?? roomStatuses?.find((s) => s.code === "available");

  const tasks = useMemo(() => (rooms ?? []).filter((r) => NEEDS_ATTENTION_CODES.has(r.status.code)), [rooms]);

  const markAvailable = useMutation({
    mutationFn: (roomId) => apiFetch(`/rooms/${roomId}/status`, { method: "PATCH", body: JSON.stringify({ statusId: availableStatus.id }) }),
    onMutate: () => setActionError(null),
    onError: (err) => setActionError(err.message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_ROOM_BOARD_QUERY_KEY] });
    },
  });

  return (
    <div>
      <PageHeader title="Housekeeping Tasks" subtitle="Rooms that need cleaning or maintenance before they can be sold again." />

      {actionError && <div className="mb-4 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{actionError}</div>}

      {roomsQuery.isError && !rooms && <ErrorState title="Couldn't load rooms" error={roomsQuery.error} onRetry={() => roomsQuery.refetch()} />}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton count={3} />
        </div>
      )}

      {rooms && rooms.length === 0 ? (
        <EmptyState icon={BedDouble} title="No rooms set up yet" subtitle="Rooms that need cleaning or maintenance will show up here." />
      ) : rooms && tasks.length === 0 ? (
        <EmptyState icon={PartyPopper} title="All rooms are clean!" subtitle="Great job — nothing needs attention right now." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((room) => (
            <Card key={room.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-semibold text-ink">Room {room.roomNumber}</p>
                  <p className="text-xs text-ink-muted">
                    {room.roomType.name}
                    {room.floor ? ` · Floor ${room.floor}` : ""}
                  </p>
                </div>
                <StatusBadge label={room.status.label} color={room.status.color} />
              </div>

              {permissions.has("rooms.housekeeping") && availableStatus && (
                <Button
                  onClick={() => markAvailable.mutate(room.id)}
                  loading={markAvailable.isPending && markAvailable.variables === room.id}
                  disabled={markAvailable.isPending}
                  className="mt-3 w-full"
                >
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
