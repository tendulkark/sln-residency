import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api.js";
import { toDateTimeInputValue } from "../lib/format.js";
import { Button, Input, Select } from "../ui/index.js";
import Modal from "./Modal.jsx";

export default function RecordPaymentModal({ booking, onClose }) {
  const queryClient = useQueryClient();
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: ["statuses", "payment"], queryFn: () => apiFetch("/statuses?domain=payment") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);
  const statusOptions = useMemo(() => (paymentStatuses ?? []).map((s) => ({ value: s.id, label: s.label })), [paymentStatuses]);

  const [methodId, setMethodId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [amount, setAmount] = useState(booking.totalAmount ?? "");
  const [referenceNote, setReferenceNote] = useState("");
  const [paidAt, setPaidAt] = useState(toDateTimeInputValue(new Date()));
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
      paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
    });
  }

  return (
    <Modal title={`Record payment · ${booking.guest?.name ?? ""}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <Input label="Amount (₹)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" options={methodOptions} value={methodId} onChange={setMethodId} placeholder="Select a method" />
        <Select label="Status" options={statusOptions} value={statusId} onChange={setStatusId} />
        <Input
          label="Reference note"
          value={referenceNote}
          onChange={(e) => setReferenceNote(e.target.value)}
          placeholder="UPI txn id, cheque no., etc."
        />
        <Input label="Paid on" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={recordMutation.isPending}>
            {recordMutation.isPending ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
