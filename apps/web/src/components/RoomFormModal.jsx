import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import Modal from "./Modal.jsx";

export default function RoomFormModal({ room, onClose }) {
  const queryClient = useQueryClient();
  const { data: roomTypes } = useQuery({ queryKey: ["room-types"], queryFn: () => apiFetch("/room-types") });

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
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
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
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Room number</label>
          <input
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Floor</label>
          <input value={floor} onChange={(e) => setFloor(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Room type</label>
          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          >
            <option value="">Select a room type</option>
            {roomTypes?.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="btn-brand rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : room ? "Save changes" : "Add room"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
