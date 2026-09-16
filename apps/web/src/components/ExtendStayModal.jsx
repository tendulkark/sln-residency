import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { formatCurrency, formatDateTime, toDateInputValue, toTimeInputValue } from "../lib/format.js";
import { Button, Input } from "../ui/index.js";
import Modal from "./Modal.jsx";

// Mirrors the server's calendar-day billing rule in bookings.routes.js —
// nights are counted by calendar day, not raw elapsed hours.
function nightsBetween(checkIn, checkOut) {
  const inDay = new Date(checkIn);
  inDay.setHours(0, 0, 0, 0);
  const outDay = new Date(checkOut);
  outDay.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((outDay - inDay) / (24 * 60 * 60 * 1000)));
}

export default function ExtendStayModal({ booking, onClose, onExtended }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(toDateInputValue(booking.checkOut));
  const [time, setTime] = useState(toTimeInputValue(booking.checkOut));
  const [additionalCharge, setAdditionalCharge] = useState("0");
  const [error, setError] = useState(null);

  const newCheckOut = useMemo(() => new Date(`${date}T${time || "00:00"}`), [date, time]);
  const currentCheckOut = new Date(booking.checkOut);
  const isValid = newCheckOut > currentCheckOut;
  const sameDay = toDateInputValue(newCheckOut) === toDateInputValue(currentCheckOut);
  // nightsBetween is calendar-day based, so a same-calendar-day extension
  // (however late) never bills an extra night — that's the whole point of
  // the "half-day / hourly charge" field below.
  const originalNights = nightsBetween(new Date(booking.checkIn), currentCheckOut);
  const nights = nightsBetween(new Date(booking.checkIn), newCheckOut);
  const newRoomTotal = Number(booking.ratePerNight) * nights;

  const extendMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify({ checkOut: newCheckOut.toISOString() }) });
      const charge = Number(additionalCharge);
      if (charge > 0) {
        await apiFetch(`/bookings/${booking.id}/charges`, {
          method: "POST",
          body: JSON.stringify({ type: "charge", description: "Stay extension charge", amount: charge }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-stay", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
      onExtended?.();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!isValid) return setError("New check-out must be after the current check-out.");
    extendMutation.mutate();
  }

  return (
    <Modal title={`Extend stay · Room ${booking.room?.roomNumber ?? ""}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-500">Current check-out: {formatDateTime(booking.checkOut)}</p>

        <div className="grid grid-cols-2 gap-4">
          <Input label="New check-out date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="New check-out time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>

        {sameDay ? (
          <p className="text-xs text-gray-500">Same-day extension — no extra night billed. Add the half-day / hourly charge below.</p>
        ) : (
          <p className="text-xs text-gray-500">This adds {nights - nightsBetween(new Date(booking.checkIn), currentCheckOut)} night(s) at the room's current rate.</p>
        )}

        <Input
          label="Additional charge (half-day / hours)"
          type="number"
          min="0"
          step="0.01"
          value={additionalCharge}
          onChange={(e) => setAdditionalCharge(e.target.value)}
        />

        <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
          <span className="font-medium text-gray-700">New room total</span>
          <span className="font-semibold text-gray-900">{formatCurrency(newRoomTotal)}</span>
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!isValid && <p className="text-xs text-red-600">New check-out must be after the current check-out.</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid || extendMutation.isPending}>
            {extendMutation.isPending ? "Extending…" : "Extend"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
