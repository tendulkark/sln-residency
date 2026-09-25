import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrencyExact as formatCurrency } from "@/lib/format.js";
import { Button, Input, Modal, Select } from "@/ui/index.js";
import { PAYMENT_METHODS_QUERY_KEY } from "@/modules/common/constants.js";

// Cancelling a booking hands back everything the guest paid, in full — the
// refund is recorded together with the cancellation (one API call, all or
// nothing), so it shows up in collections and reports the same day.
export default function CancelStayModal({ bookingId, stay, roomLabel, onClose, onCancelled }) {
  const { data: methods } = useQuery({ queryKey: [PAYMENT_METHODS_QUERY_KEY], queryFn: () => apiFetch("/payment-methods") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);

  const refundDue = Math.max(0, stay.summary.advancePaid);
  const lastPayment = [...stay.payments].reverse().find((p) => p.type !== "refund");
  const [refundMethodId, setRefundMethodId] = useState(lastPayment?.methodId ?? "");
  const [refundNote, setRefundNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          ...(refundDue > 0 ? { refund: { methodId: refundMethodId, referenceNote: refundNote.trim() || undefined } } : {}),
        }),
      }),
    onSuccess: () => onCancelled?.(),
    onError: (err) => setError(err.message),
  });

  return (
    <Modal title={`Cancel booking · Room ${roomLabel}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          This cancels the booking for <span className="font-semibold text-ink">{stay.bookings[0].guest.name}</span>
          {stay.bookings.length > 1 ? ` across all ${stay.bookings.length} rooms` : ""} and its reserved invoice number.
        </p>

        {refundDue > 0 ? (
          <div className="rounded-md border-2 border-warning bg-warning-tint p-3">
            <p className="mb-2 text-sm font-semibold text-warning">The guest has paid {formatCurrency(refundDue)} — all of it will be refunded.</p>
            <div className="space-y-2">
              <Select label="Refund method" options={methodOptions} loading={!methods} value={refundMethodId} onChange={setRefundMethodId} placeholder="Select method" />
              <Input label="Reference (optional)" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="e.g. UPI ref / handed over in cash" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No payment has been taken, so there's nothing to refund.</p>
        )}

        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Guest changed plans" />

        {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Keep booking
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              cancel.mutate();
            }}
            disabled={(refundDue > 0 && !refundMethodId)} loading={cancel.isPending}
          >
            <XCircle className="h-4 w-4" />
            {cancel.isPending ? "Cancelling…" : refundDue > 0 ? `Refund ${formatCurrency(refundDue)} & Cancel` : "Cancel Booking"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
