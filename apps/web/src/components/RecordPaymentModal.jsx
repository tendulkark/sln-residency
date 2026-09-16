import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import Modal from "./Modal.jsx";

export default function RecordPaymentModal({ booking, onClose }) {
  const queryClient = useQueryClient();
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: ["statuses", "payment"], queryFn: () => apiFetch("/statuses?domain=payment") });

  const [methodId, setMethodId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [amount, setAmount] = useState(booking.totalAmount ?? "");
  const [referenceNote, setReferenceNote] = useState("");
  const [error, setError] = useState(null);

  const paidStatus = paymentStatuses?.find((s) => s.code === "paid");

  useEffect(() => {
    if (!statusId && paidStatus) setStatusId(paidStatus.id);
  }, [statusId, paidStatus]);

  const recordMutation = useMutation({
    mutationFn: (payload) => apiFetch("/payments", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!methodId) return setError("Choose a payment method");
    recordMutation.mutate({
      bookingId: booking.id,
      methodId,
      statusId: statusId || paidStatus?.id,
      amount: Number(amount),
      referenceNote: referenceNote || undefined,
    });
  }

  return (
    <Modal title={`Record payment · ${booking.guest?.name ?? ""}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Amount (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Method</label>
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required>
            <option value="">Select a method</option>
            {methods?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            {paymentStatuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Reference note</label>
          <input
            value={referenceNote}
            onChange={(e) => setReferenceNote(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="UPI txn id, cheque no., etc."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
            Cancel
          </button>
          <button type="submit" disabled={recordMutation.isPending} className="btn-brand rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {recordMutation.isPending ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
