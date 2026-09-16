import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/format.js";
import Modal from "./Modal.jsx";

const EMPTY_FORM = { name: "", basePrice: "", capacity: 2, amenities: "" };

export default function RoomTypesModal({ onClose }) {
  const queryClient = useQueryClient();
  const { data: roomTypes, isLoading } = useQuery({ queryKey: ["room-types"], queryFn: () => apiFetch("/room-types") });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["room-types"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => apiFetch("/room-types", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_FORM);
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => apiFetch(`/room-types/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
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
      basePrice: Number(form.basePrice),
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
    setForm({ name: rt.name, basePrice: rt.basePrice, capacity: rt.capacity, amenities: (rt.amenities ?? []).join(", ") });
  }

  return (
    <Modal title="Manage room types" onClose={onClose} wide>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="space-y-2">
        {roomTypes?.map((rt) => (
          <div key={rt.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-900">{rt.name}</p>
              <p className="text-xs text-gray-500">
                {formatCurrency(rt.basePrice)} base · capacity {rt.capacity} · {rt._count?.rooms ?? 0} room(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(rt)} className="text-xs font-medium text-gray-600 hover:text-gray-900">
                Edit
              </button>
              <button
                onClick={() => deleteMutation.mutate(rt.id)}
                disabled={rt._count?.rooms > 0}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-gray-200 pt-4">
        <p className="mb-2 text-sm font-semibold text-gray-900">{editingId ? "Edit room type" : "Add room type"}</p>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Base price (excl. tax)"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Capacity"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Amenities (comma separated)"
            value={form.amenities}
            onChange={(e) => setForm({ ...form, amenities: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Cancel edit
            </button>
          )}
          <button onClick={submitForm} className="btn-brand rounded-md px-3 py-1.5 text-xs font-medium text-white">
            {editingId ? "Save changes" : "Add room type"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
