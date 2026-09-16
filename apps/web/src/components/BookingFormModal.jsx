import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { toDateInputValue } from "../lib/format.js";
import Modal from "./Modal.jsx";

export default function BookingFormModal({ defaultRoomId, defaultDate, onClose }) {
  const queryClient = useQueryClient();
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => apiFetch("/rooms") });

  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [checkIn, setCheckIn] = useState(toDateInputValue(defaultDate ?? new Date()));
  const [checkOut, setCheckOut] = useState(toDateInputValue(new Date(new Date(defaultDate ?? new Date()).getTime() + 86400000)));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [ratePerNight, setRatePerNight] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  const selectedRoom = useMemo(() => rooms?.find((r) => r.id === roomId), [rooms, roomId]);

  const { data: guestMatches } = useQuery({
    queryKey: ["guests", guestName],
    queryFn: () => apiFetch(`/guests?search=${encodeURIComponent(guestName)}`),
    enabled: guestName.trim().length >= 2 && !selectedGuestId,
  });

  function handleRoomChange(id) {
    setRoomId(id);
    const room = rooms?.find((r) => r.id === id);
    if (room && !ratePerNight) setRatePerNight(room.pricing.total);
  }

  const createBooking = useMutation({
    mutationFn: (payload) => apiFetch("/bookings", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!roomId) return setError("Choose a room");
    if (!selectedGuestId && !guestName.trim()) return setError("Enter a guest name");

    createBooking.mutate({
      roomId,
      ...(selectedGuestId ? { guestId: selectedGuestId } : { guest: { name: guestName.trim(), phone: guestPhone || undefined } }),
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      adults: Number(adults),
      children: Number(children),
      ratePerNight: Number(ratePerNight || selectedRoom?.pricing.total || 0),
      notes: notes || undefined,
    });
  }

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Room</label>
            <select
              value={roomId}
              onChange={(e) => handleRoomChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select a room</option>
              {rooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} · {room.roomType.name} · ₹{room.pricing.total}/night
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Rate per night (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={ratePerNight}
              onChange={(e) => setRatePerNight(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="relative space-y-1">
          <label className="text-sm font-medium text-gray-700">Guest name</label>
          <input
            value={guestName}
            onChange={(e) => {
              setGuestName(e.target.value);
              setSelectedGuestId(null);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search existing guest or type a new name"
            required
          />
          {guestMatches?.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {guestMatches.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setGuestName(g.name);
                      setGuestPhone(g.phone ?? "");
                      setSelectedGuestId(g.id);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {g.name} {g.phone ? `· ${g.phone}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Phone</label>
          <input
            value={guestPhone}
            onChange={(e) => {
              setGuestPhone(e.target.value);
              setSelectedGuestId(null);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2 space-y-1">
            <label className="text-sm font-medium text-gray-700">Check-in</label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-sm font-medium text-gray-700">Check-out</label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Adults</label>
            <input
              type="number"
              min="1"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Children</label>
            <input
              type="number"
              min="0"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createBooking.isPending}
            className="btn-brand rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {createBooking.isPending ? "Creating…" : "Create booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
