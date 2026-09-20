import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api.js";
import { formatCurrency } from "@/lib/format.js";
import { Button, GstCalculator, Input, computeGst, GST_MODE } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import { ROOMS_QUERY_KEY, ROOM_TYPES_QUERY_KEY } from "@/modules/rooms/constants.js";

const EMPTY_FORM = { name: "", capacity: 2, amenities: "" };
const EMPTY_GST = { amount: "", ratePercent: "", mode: GST_MODE.INCLUDE };

export default function RoomTypesModal({ onClose }) {
  const queryClient = useQueryClient();
  const { data: roomTypes, isLoading } = useQuery({ queryKey: [ROOM_TYPES_QUERY_KEY], queryFn: () => apiFetch("/room-types") });
  const [form, setForm] = useState(EMPTY_FORM);
  const [gst, setGst] = useState(EMPTY_GST);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const basePrice = computeGst(gst.amount, gst.ratePercent, gst.mode).exclusiveAmount;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: [ROOM_TYPES_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => apiFetch("/room-types", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_FORM);
      setGst(EMPTY_GST);
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiFetch(`/room-types/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
      setGst(EMPTY_GST);
    },
    onError: (err) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/room-types/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  function submitForm() {
    setError(null);
    const payload = {
      name: form.name,
      basePrice,
      capacity: Number(form.capacity),
      amenities: form.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function startEdit(rt) {
    setEditingId(rt.id);
    setForm({ name: rt.name, capacity: rt.capacity, amenities: (rt.amenities ?? []).join(", ") });
    // Stored basePrice is always GST-exclusive, so "include" (add GST on
    // top of the entered amount) reproduces it as the calculator's input.
    // The rate itself isn't stored on the room type — it's looked up live
    // from the tenant's TaxRule at pricing time — so prefill it from that
    // same live lookup (rt.pricing.ratePercent) rather than leaving it
    // blank, which made a previously-taxed price look untaxed on reopen.
    setGst({ amount: rt.basePrice, ratePercent: rt.pricing.ratePercent || "", mode: GST_MODE.INCLUDE });
  }

  return (
    <Modal title="Manage room types" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      <div className="space-y-2">
        {roomTypes?.map((rt) => (
          <div key={rt.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
            <div>
              <p className="text-sm font-medium text-ink">{rt.name}</p>
              <p className="text-xs text-ink-muted">
                Base {formatCurrency(rt.pricing.basePrice)} · CGST {formatCurrency(rt.pricing.cgst)} · SGST {formatCurrency(rt.pricing.sgst)} · GST{" "}
                {rt.pricing.ratePercent}% · capacity {rt.capacity} · {rt._count?.rooms ?? 0} room(s)
              </p>
              <p className="text-sm font-semibold text-success">{formatCurrency(rt.pricing.total)}/night</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => startEdit(rt)}>
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate(rt.id)} disabled={rt._count?.rooms > 0}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-sm font-semibold text-ink">{editingId ? "Edit room type" : "Add room type"}</p>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <div className="col-span-2">
            <Input placeholder="Amenities (comma separated)" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 rounded-md border border-line p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">
            Nightly price — enter either the guest-facing price ("Exclude GST", GST gets backed out) or the base cost ("Include GST", GST gets
            added on top)
          </p>
          <GstCalculator
            compact
            amount={gst.amount}
            ratePercent={gst.ratePercent}
            mode={gst.mode}
            onAmountChange={(v) => setGst({ ...gst, amount: v })}
            onRateChange={(v) => setGst({ ...gst, ratePercent: v })}
            onModeChange={(v) => setGst({ ...gst, mode: v })}
          />
          <p className="mt-2 text-xs text-ink-muted">Base price saved (excl. tax): {formatCurrency(basePrice)}</p>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          {editingId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setGst(EMPTY_GST);
              }}
            >
              Cancel edit
            </Button>
          )}
          <Button size="sm" onClick={submitForm} disabled={!basePrice}>
            {editingId ? "Save changes" : "Add room type"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
