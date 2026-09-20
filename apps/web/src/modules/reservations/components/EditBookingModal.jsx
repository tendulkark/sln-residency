import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api.js";
import { toDateTimeInputValue } from "@/lib/format.js";
import { Button, Input, Textarea, Modal } from "@/ui/index.js";
import { BOOKINGS_QUERY_KEY } from "@/modules/reservations/constants.js";
import { DASHBOARD_ROOM_BOARD_QUERY_KEY, DASHBOARD_SUMMARY_QUERY_KEY } from "@/modules/dashboard/constants.js";

export default function EditBookingModal({ booking, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState(toDateTimeInputValue(booking.checkIn));
  const [checkOut, setCheckOut] = useState(toDateTimeInputValue(booking.checkOut));
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  const [ratePerNight, setRatePerNight] = useState(booking.ratePerNight);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [error, setError] = useState(null);

  const saveMutation = useMutation({
    mutationFn: (payload) => apiFetch(`/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BOOKINGS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_ROOM_BOARD_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_SUMMARY_QUERY_KEY] });
      onSaved?.();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate({
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      adults: Number(adults),
      children: Number(children),
      ratePerNight: Number(ratePerNight),
      notes: notes || null,
    });
  }

  return (
    <Modal title={`Edit booking · ${booking.guest.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Check-in" type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
          <Input label="Check-out" type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Adults" type="number" min="1" value={adults} onChange={(e) => setAdults(e.target.value)} />
          <Input label="Children" type="number" min="0" value={children} onChange={(e) => setChildren(e.target.value)} />
          <Input label="Rate/night (₹)" type="number" min="0" step="0.01" value={ratePerNight} onChange={(e) => setRatePerNight(e.target.value)} />
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
