import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { formatDate, toDateInputValue } from "../lib/format.js";
import { useAuthStore } from "../store/authStore.js";
import Modal from "./Modal.jsx";

export default function RoomClosuresModal({ onClose }) {
  const queryClient = useQueryClient();
  const canManage = useAuthStore((s) => s.permissions.has("roomclosures.manage"));
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => apiFetch("/rooms") });
  const { data: closures, isLoading } = useQuery({ queryKey: ["room-closures"], queryFn: () => apiFetch("/room-closures") });

  const [roomId, setRoomId] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(toDateInputValue(new Date(Date.now() + 86400000)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["room-closures"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => apiFetch("/room-closures", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setReason("");
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/room-closures/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!roomId) return setError("Choose a room");
    createMutation.mutate({
      roomId,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      reason: reason || undefined,
    });
  }

  return (
    <Modal title="Closed periods" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      <div className="space-y-2">
        {closures?.length === 0 && <p className="text-sm text-gray-500">No rooms are currently blocked out.</p>}
        {closures?.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Room {c.room.roomNumber}</p>
              <p className="text-xs text-gray-500">
                {formatDate(c.startDate)} → {formatDate(c.endDate)} {c.reason ? `· ${c.reason}` : ""}
              </p>
            </div>
            {canManage && (
              <button onClick={() => deleteMutation.mutate(c.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={handleSubmit} className="mt-5 border-t border-gray-200 pt-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Block a room</p>
          <div className="grid grid-cols-2 gap-3">
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select a room</option>
              {rooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} · {room.roomType.name}
                </option>
              ))}
            </select>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" disabled={createMutation.isPending} className="btn-brand rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {createMutation.isPending ? "Blocking…" : "Block room"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
