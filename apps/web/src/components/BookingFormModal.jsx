import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { ID_PROOF_TYPES } from "@sln/shared-schemas";
import { apiFetch } from "../lib/api.js";
import { formatCurrency, toDateTimeInputValue } from "../lib/format.js";
import { Button, Combobox, Input, Select, Switch, Textarea } from "../ui/index.js";
import Modal from "./Modal.jsx";

const EMPTY_PAYMENT_ROW = { amount: "", methodId: "" };
const EMPTY_CHARGE_ROW = { description: "", amount: "" };
const ID_PROOF_OPTIONS = ID_PROOF_TYPES.map((t) => ({ value: t.value, label: t.label }));

// Nights are billed in rolling 24-hour blocks from the exact check-in
// timestamp (mirrors the server's rule in lib/billing.js) — a stay under
// 24h still bills as 1 night, and any overshoot into a new 24h block bills
// as another full night.
function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 86400000));
}

export default function BookingFormModal({ defaultRoomId, defaultDate, onClose }) {
  const queryClient = useQueryClient();
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: ["statuses", "payment"], queryFn: () => apiFetch("/statuses?domain=payment") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);
  const paidStatus = paymentStatuses?.find((s) => s.code === "paid");

  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [groupRoomIds, setGroupRoomIds] = useState(defaultRoomId ? [defaultRoomId] : []);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestPhone2, setGuestPhone2] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestAddress, setGuestAddress] = useState("");
  const [idProofType, setIdProofType] = useState("");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [checkIn, setCheckIn] = useState(toDateTimeInputValue(defaultDate ?? new Date()));
  const [checkOut, setCheckOut] = useState(toDateTimeInputValue(new Date(new Date(defaultDate ?? new Date()).getTime() + 86400000)));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [ratePerNight, setRatePerNight] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentRows, setPaymentRows] = useState([EMPTY_PAYMENT_ROW]);
  const [chargeRows, setChargeRows] = useState([]);
  const [discount, setDiscount] = useState("");
  const [checkInImmediately, setCheckInImmediately] = useState(false);
  const [error, setError] = useState(null);

  // Only rooms actually free for this exact check-in/check-out window are
  // ever offered — availability is judged server-side by exact timestamp,
  // not just a room's current live status (handled in GET /rooms).
  const checkInIso = useMemo(() => new Date(checkIn).toISOString(), [checkIn]);
  const checkOutIso = useMemo(() => new Date(checkOut).toISOString(), [checkOut]);
  const roomsQueryEnabled = !Number.isNaN(new Date(checkIn).getTime()) && !Number.isNaN(new Date(checkOut).getTime()) && new Date(checkOut) > new Date(checkIn);
  const { data: rooms } = useQuery({
    queryKey: ["rooms", "available", checkInIso, checkOutIso],
    queryFn: () => apiFetch(`/rooms?checkIn=${encodeURIComponent(checkInIso)}&checkOut=${encodeURIComponent(checkOutIso)}`),
    enabled: roomsQueryEnabled,
  });

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
  const chargesTotal = chargeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const grandTotal = Math.max(0, roomsTotal + chargesTotal - discountAmount);
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

  function updateChargeRow(index, patch) {
    setChargeRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function selectGuest(option) {
    const g = option.raw;
    setGuestName(g.name);
    setGuestPhone(g.phone ?? "");
    setGuestPhone2(g.phone2 ?? "");
    setGuestEmail(g.email ?? "");
    setGuestAddress(g.address ?? "");
    setIdProofType(g.idProofType ?? "");
    setIdProofNumber(g.idProofNumber ?? "");
    setCompanyName(g.companyName ?? "");
    setCompanyGstin(g.gstin ?? "");
    setSelectedGuestId(option.value);
  }

  function clearSelectedGuest() {
    setSelectedGuestId(null);
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
    if (!selectedGuestId && !guestPhone.trim()) return setError("Enter a guest phone number");
    if (paymentRows.some((r) => Number(r.amount) > 0 && !r.methodId)) return setError("Choose a payment method for every amount entered");
    if (chargeRows.some((r) => Number(r.amount) > 0 && !r.description.trim())) return setError("Enter a description for every charge amount");

    const validPayments = paymentRows.filter((r) => r.methodId && Number(r.amount) > 0);
    const validCharges = chargeRows.filter((r) => r.description.trim() && Number(r.amount) > 0);

    createBooking.mutate({
      ...(isGroupBooking ? { roomIds: groupRoomIds } : { roomId, ratePerNight: Number(ratePerNight || selectedRoom?.pricing.total || 0) }),
      ...(selectedGuestId
        ? { guestId: selectedGuestId }
        : {
            guest: {
              name: guestName.trim(),
              phone: guestPhone.trim(),
              phone2: guestPhone2.trim() || undefined,
              email: guestEmail.trim() || undefined,
              address: guestAddress.trim() || undefined,
              idProofType: idProofType || undefined,
              idProofNumber: idProofNumber.trim() || undefined,
              companyName: companyName.trim() || undefined,
              gstin: companyGstin.trim() || undefined,
            },
          }),
      checkIn: checkInIso,
      checkOut: checkOutIso,
      adults: Number(adults),
      children: Number(children),
      notes: notes || undefined,
      ...(validPayments.length > 0
        ? { advancePayments: validPayments.map((r) => ({ amount: Number(r.amount), methodId: r.methodId, statusId: paidStatus?.id })) }
        : {}),
      ...(validCharges.length > 0 ? { charges: validCharges.map((r) => ({ description: r.description.trim(), amount: Number(r.amount) })) } : {}),
      ...(discountAmount > 0 ? { discount: { amount: discountAmount } } : {}),
      ...(checkInImmediately ? { checkInImmediately: true } : {}),
    });
  }

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Check-in" type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
          <Input label="Check-out" type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </div>
        <p className="text-xs text-gray-500">
          Billed in rolling 24-hour blocks from check-in — {nights} night{nights === 1 ? "" : "s"} for this window. Only rooms free for this exact
          period are listed below.
        </p>

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
              {roomsQueryEnabled && rooms?.length === 0 && <p className="px-2 py-1 text-xs text-gray-500">No rooms free for this window.</p>}
            </div>
            {groupRoomIds.length > 0 && (
              <p className="text-xs text-gray-500">
                {groupRoomIds.length} room(s) selected · {formatCurrency(groupRoomsTotal)}/night total
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Room"
              options={roomOptions}
              value={roomId}
              onChange={handleRoomChange}
              placeholder={roomsQueryEnabled ? "Select a room" : "Pick a valid check-in/check-out first"}
            />
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

        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Guest info</p>

          <Combobox
            label="Guest name"
            query={guestName}
            onQueryChange={(value) => {
              setGuestName(value);
              clearSelectedGuest();
            }}
            options={guestOptions}
            onSelect={selectGuest}
            placeholder="Search existing guest or type a new name"
            createLabel="No matches — a new guest will be created"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Mobile number"
              value={guestPhone}
              onChange={(e) => {
                setGuestPhone(e.target.value);
                clearSelectedGuest();
              }}
              required
            />
            <Input
              label="Alternate mobile number (optional)"
              value={guestPhone2}
              onChange={(e) => {
                setGuestPhone2(e.target.value);
                clearSelectedGuest();
              }}
            />
          </div>

          <Input
            label="Email (optional)"
            type="email"
            value={guestEmail}
            onChange={(e) => {
              setGuestEmail(e.target.value);
              clearSelectedGuest();
            }}
          />

          <Textarea
            label="Address (optional)"
            value={guestAddress}
            onChange={(e) => {
              setGuestAddress(e.target.value);
              clearSelectedGuest();
            }}
            rows={2}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Government ID proof (optional)"
              options={ID_PROOF_OPTIONS}
              value={idProofType}
              onChange={(v) => {
                setIdProofType(v);
                clearSelectedGuest();
              }}
              placeholder="Select ID type"
            />
            {idProofType && (
              <Input
                label="ID number"
                value={idProofNumber}
                onChange={(e) => {
                  setIdProofNumber(e.target.value);
                  clearSelectedGuest();
                }}
              />
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Company info (optional, for GST claim)</p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Company name"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                clearSelectedGuest();
              }}
            />
            <Input
              label="Company GSTIN"
              value={companyGstin}
              onChange={(e) => {
                setCompanyGstin(e.target.value);
                clearSelectedGuest();
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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

          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Other charges (extra bed, fines, etc.)</p>
            {chargeRows.map((row, i) => (
              <div key={i} className="mb-2 flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Description"
                    placeholder="e.g. Extra bed"
                    value={row.description}
                    onChange={(e) => updateChargeRow(i, { description: e.target.value })}
                  />
                </div>
                <div className="w-32">
                  <Input
                    label="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateChargeRow(i, { amount: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setChargeRows((rows) => rows.filter((_, idx) => idx !== i))}
                  aria-label="Remove charge"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setChargeRows((rows) => [...rows, { ...EMPTY_CHARGE_ROW }])}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add charge
            </button>
          </div>

          <Input label="Discount (optional)" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />

          <Switch
            label="Check in immediately"
            description="Guest is arriving now — skip the separate check-in step"
            checked={checkInImmediately}
            onChange={setCheckInImmediately}
          />

          <div className="grid grid-cols-6 gap-2 rounded-md bg-muted p-3 text-center">
            <SummaryStat label="Nights" value={nights} />
            <SummaryStat label="Rate" value={formatCurrency(nightlyRate)} />
            <SummaryStat label="Charges" value={formatCurrency(chargesTotal)} />
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
