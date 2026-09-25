import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api.js";
import { Button, Input, Select, Modal } from "@/ui/index.js";
import { ROOMS_QUERY_KEY, ROOM_TYPES_QUERY_KEY } from "@/modules/rooms/constants.js";
import { DASHBOARD_ROOM_BOARD_QUERY_KEY } from "@/modules/dashboard/constants.js";

export default function RoomFormModal({ room, onClose }) {
  const queryClient = useQueryClient();
  const { data: roomTypes } = useQuery({ queryKey: [ROOM_TYPES_QUERY_KEY], queryFn: () => apiFetch("/room-types") });
  const roomTypeOptions = useMemo(() => (roomTypes ?? []).map((rt) => ({ value: rt.id, label: rt.name })), [roomTypes]);

  const [roomNumber, setRoomNumber] = useState(room?.roomNumber ?? "");
  const [floor, setFloor] = useState(room?.floor ?? "");
  const [roomTypeId, setRoomTypeId] = useState(room?.roomType.id ?? "");
  const [error, setError] = useState(null);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      room
        ? apiFetch(`/rooms/${room.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/rooms", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_ROOM_BOARD_QUERY_KEY] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!roomNumber.trim() || !roomTypeId) return setError("Room number and room type are required");
    saveMutation.mutate({ roomNumber: roomNumber.trim(), floor: floor || undefined, roomTypeId });
  }

  return (
    <Modal title={room ? `Edit room ${room.roomNumber}` : "Add room"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

        <Input label="Room number" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} required />
        <Input label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
        <Select
          label="Room type"
          options={roomTypeOptions}
          loading={!roomTypes}
          emptyText="No room types yet — add one with Manage Room Types first"
          value={roomTypeId}
          onChange={setRoomTypeId}
          placeholder="Select a room type"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : room ? "Save changes" : "Add room"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
