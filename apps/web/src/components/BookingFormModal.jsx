import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { formatCurrency, toDateInputValue } from "../lib/format.js";
import { Button, Combobox, Input, Select, Switch, Textarea } from "../ui/index.js";
import Modal from "./Modal.jsx";

const EMPTY_PAYMENT_ROW = { amount: "", methodId: "" };

// Mirrors the server's calendar-day billing rule in bookings.routes.js —
// nights are counted by calendar day, not raw elapsed hours.
function nightsBetween(checkIn, checkOut) {
  const inDay = new Date(checkIn);
  inDay.setHours(0, 0, 0, 0);
  const outDay = new Date(checkOut);
  outDay.setHours(0, 0, 0, 0);
  if (Number.isNaN(inDay.getTime()) || Number.isNaN(outDay.getTime()) || outDay <= inDay) return 1;
  return Math.max(1, Math.round((outDay - inDay) / 86400000));
}

export default function BookingFormModal({ defaultRoomId, defaultDate, onClose }) {
  const queryClient = useQueryClient();
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => apiFetch("/rooms") });
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: ["statuses", "payment"], queryFn: () => apiFetch("/statuses?domain=payment") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);
  const paidStatus = paymentStatuses?.find((s) => s.code === "paid");

  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [groupRoomIds, setGroupRoomIds] = useState(defaultRoomId ? [defaultRoomId] : []);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [checkIn, setCheckIn] = useState(toDateInputValue(defaultDate ?? new Date()));
  const [checkOut, setCheckOut] = useState(toDateInputValue(new Date(new Date(defaultDate ?? new Date()).getTime() + 86400000)));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [ratePerNight, setRatePerNight] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentRows, setPaymentRows] = useState([EMPTY_PAYMENT_ROW]);
  const [discount, setDiscount] = useState("");
  const [checkInImmediately, setCheckInImmediately] = useState(false);
  const [error, setError] = useState(null);

  const selectedRoom = useMemo(() => rooms?.find((r) => r.id === roomId), [rooms, roomId]);
  const roomOptions = useMemo(
    () => (rooms ?? []).map((r) => ({ value: r.id, label: `${r.roomNumber} · ${r.roomType.name} · ₹${r.pricing.total}/night` })),
    [rooms]
  );
  const groupRoomsTotal = useMemo(
    () => (rooms ?? []).filter((r) => groupRoomIds.includes(r.id)).reduce((sum, r) => sum + r.pricing.total, 0),
    [rooms, groupRoomIds]
  );

  const { data: guestMatches } = useQuery({
    queryKey: ["guests", guestName],
    queryFn: () => apiFetch(`/guests?search=${encodeURIComponent(guestName)}`),
    enabled: guestName.trim().length >= 2 && !selectedGuestId,
  });
  const guestOptions = useMemo(
    () => (guestMatches ?? []).map((g) => ({ value: g.id, label: g.name, subLabel: g.phone, raw: g })),
    [guestMatches]
  );

  const nights = nightsBetween(checkIn, checkOut);
  const nightlyRate = isGroupBooking ? groupRoomsTotal : Number(ratePerNight || selectedRoom?.pricing.total || 0);
  const roomsTotal = nightlyRate * nights;
  const discountAmount = Number(discount) || 0;
  const grandTotal = Math.max(0, roomsTotal - discountAmount);
  const enteredTotal = paymentRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const balance = grandTotal - enteredTotal;

  function handleRoomChange(id) {
    setRoomId(id);
    const room = rooms?.find((r) => r.id === id);
    if (room && !ratePerNight) setRatePerNight(room.pricing.total);
  }

  function toggleGroupRoom(id) {
    setGroupRoomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function updatePaymentRow(index, patch) {
    setPaymentRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
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
    if (isGroupBooking ? groupRoomIds.length < 2 : !roomId) {
      return setError(isGroupBooking ? "Choose at least 2 rooms for a group booking" : "Choose a room");
    }
    if (!selectedGuestId && !guestName.trim()) return setError("Enter a guest name");
    if (paymentRows.some((r) => Number(r.amount) > 0 && !r.methodId)) return setError("Choose a payment method for every amount entered");

    const validPayments = paymentRows.filter((r) => r.methodId && Number(r.amount) > 0);

    createBooking.mutate({
      ...(isGroupBooking ? { roomIds: groupRoomIds } : { roomId, ratePerNight: Number(ratePerNight || selectedRoom?.pricing.total || 0) }),
      ...(selectedGuestId ? { guestId: selectedGuestId } : { guest: { name: guestName.trim(), phone: guestPhone || undefined } }),
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      adults: Number(adults),
      children: Number(children),
      notes: notes || undefined,
      ...(validPayments.length > 0
        ? { advancePayments: validPayments.map((r) => ({ amount: Number(r.amount), methodId: r.methodId, statusId: paidStatus?.id })) }
        : {}),
      ...(discountAmount > 0 ? { discount: { amount: discountAmount } } : {}),
      ...(checkInImmediately ? { checkInImmediately: true } : {}),
    });
  }

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!defaultRoomId && (
          <Switch
            label="Group booking"
            description="One guest across multiple rooms, billed together"
            checked={isGroupBooking}
            onChange={(checked) => {
              setIsGroupBooking(checked);
              setGroupRoomIds([]);
            }}
          />
        )}

        {isGroupBooking ? (
          <div className="space-y-1">
            <span className="block text-sm font-medium text-gray-700">Rooms</span>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line-strong p-2">
              {rooms?.map((room) => (
                <label key={room.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={groupRoomIds.includes(room.id)} onChange={() => toggleGroupRoom(room.id)} className="accent-brand" />
                  {room.roomNumber} · {room.roomType.name} · {formatCurrency(room.pricing.total)}/night
                </label>
              ))}
            </div>
            {groupRoomIds.length > 0 && (
              <p className="text-xs text-gray-500">
                {groupRoomIds.length} room(s) selected · {formatCurrency(groupRoomsTotal)}/night total
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Select label="Room" options={roomOptions} value={roomId} onChange={handleRoomChange} placeholder="Select a room" />
            <Input
              label="Rate per night (₹)"
              type="number"
              min="0"
              step="0.01"
              value={ratePerNight}
              onChange={(e) => setRatePerNight(e.target.value)}
              required
            />
          </div>
        )}

        <Combobox
          label="Guest name"
          query={guestName}
          onQueryChange={(value) => {
            setGuestName(value);
            setSelectedGuestId(null);
          }}
          options={guestOptions}
          onSelect={(option) => {
            setGuestName(option.raw.name);
            setGuestPhone(option.raw.phone ?? "");
            setSelectedGuestId(option.value);
          }}
          placeholder="Search existing guest or type a new name"
          createLabel="No matches — a new guest will be created"
        />

        <Input
          label="Phone"
          value={guestPhone}
          onChange={(e) => {
            setGuestPhone(e.target.value);
            setSelectedGuestId(null);
          }}
        />

        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <Input label="Check-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
          </div>
          <div className="col-span-2">
            <Input label="Check-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
          </div>
          <Input label="Adults" type="number" min="1" value={adults} onChange={(e) => setAdults(e.target.value)} />
          <Input label="Children" type="number" min="0" value={children} onChange={(e) => setChildren(e.target.value)} />
        </div>

        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment</p>

          {paymentRows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={`Amount ${i + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => updatePaymentRow(i, { amount: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <Select
                  label={`Method${i > 0 ? ` ${i + 1}` : ""}`}
                  options={methodOptions}
                  value={row.methodId}
                  onChange={(v) => updatePaymentRow(i, { methodId: v })}
                  placeholder="Select method"
                />
              </div>
              {paymentRows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPaymentRows((rows) => rows.filter((_, idx) => idx !== i))}
                  aria-label="Remove payment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPaymentRows((rows) => [...rows, { ...EMPTY_PAYMENT_ROW }])}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add payment method
          </button>

          <Input label="Discount (optional)" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />

          <Switch
            label="Check in immediately"
            description="Guest is arriving now — skip the separate check-in step"
            checked={checkInImmediately}
            onChange={setCheckInImmediately}
          />

          <div className="grid grid-cols-5 gap-2 rounded-md bg-muted p-3 text-center">
            <SummaryStat label="Nights" value={nights} />
            <SummaryStat label="Rate" value={formatCurrency(nightlyRate)} />
            <SummaryStat label="Discount" value={`-${formatCurrency(discountAmount)}`} />
            <SummaryStat label="Total" value={formatCurrency(grandTotal)} />
            <SummaryStat label="Balance" value={formatCurrency(balance)} valueClassName={balance > 0 ? "text-red-600" : "text-emerald-600"} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createBooking.isPending}>
            {createBooking.isPending ? "Creating…" : "Create booking"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryStat({ label, value, valueClassName = "text-gray-900" }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}
