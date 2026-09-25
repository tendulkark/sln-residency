import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, LogOut, Split, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrencyExact as formatCurrency, formatDateTime } from "@/lib/format.js";
import { Button, Input, Modal, Select } from "@/ui/index.js";
import { PAYMENT_METHODS_QUERY_KEY } from "@/modules/common/constants.js";

function describeGap(minutes) {
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  return [days && `${days}d`, hours && `${hours}h`, !days && `${mins}m`].filter(Boolean).join(" ") || "0m";
}

function BillingOption({ selected, onSelect, title, detail, amount }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-colors ${
        selected ? "border-brand bg-brand-tint" : "border-line bg-card hover:border-line-strong"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-sm font-bold text-ink">{formatCurrency(amount)}</span>
    </button>
  );
}

// Closing a checked-in stay. Staff first confirm how it's billed when the
// guest's real departure doesn't match the booking (an overstay's extra
// nights, or an early departure), then settle the bill to exactly zero —
// collect what's due, or refund what was overpaid. The API refuses any
// checkout that would leave a balance, so the button stays locked until
// the entered amounts match.
export default function CheckoutModal({ bookingId, roomLabel, onClose, onCheckedOut }) {
  const { data: preview, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["checkout-preview", bookingId],
    queryFn: () => apiFetch(`/bookings/${bookingId}/checkout-preview`),
    staleTime: 0,
  });
  const { data: methods } = useQuery({ queryKey: [PAYMENT_METHODS_QUERY_KEY], queryFn: () => apiFetch("/payment-methods") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);

  const [billing, setBilling] = useState(null);
  const [rows, setRows] = useState([{ methodId: "", amount: "" }]);
  const [refundMethodId, setRefundMethodId] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (preview && !preview.differs) setBilling("booked");
  }, [preview]);

  const chosen = preview && billing ? preview[billing] : null;
  const balance = chosen?.balanceDue ?? 0;

  // Pre-fill the amount to collect whenever the bill being settled changes.
  useEffect(() => {
    if (chosen && balance > 0) setRows([{ methodId: "", amount: String(balance) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing, balance]);

  const entered = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const rowsComplete = rows.every((r) => r.methodId && Number(r.amount) > 0);
  const settled =
    Boolean(chosen) &&
    (balance === 0 || (balance > 0 && rowsComplete && Math.abs(entered - balance) < 0.005) || (balance < 0 && Boolean(refundMethodId)));

  const checkout = useMutation({
    mutationFn: () =>
      apiFetch(`/bookings/${bookingId}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          billing,
          ...(balance > 0 ? { payments: rows.map((r) => ({ methodId: r.methodId, amount: Number(r.amount) })) } : {}),
          ...(balance < 0 ? { refund: { methodId: refundMethodId, referenceNote: refundNote.trim() || undefined } } : {}),
        }),
      }),
    onSuccess: (result) => onCheckedOut?.(result),
    onError: (err) => {
      setError(err.message);
      // The bill may have moved on (e.g. a new 24-hour block started while
      // this dialog sat open) — show the current figures.
      refetch();
    },
  });

  const overstay = preview?.direction === "overstay";

  return (
    <Modal title={`Checkout · Room ${roomLabel}`} onClose={onClose}>
      {isLoading || !preview ? (
        <p className="text-sm text-ink-muted">Working out the final bill…</p>
      ) : (
        <div className="space-y-4">
          {preview.differs ? (
            <div className="space-y-2">
              <div className="rounded-md border border-warning/40 bg-warning-tint px-3 py-2 text-sm text-warning">
                {overstay
                  ? `The guest is leaving ${describeGap(preview.minutesFromSchedule)} after the booked checkout (${formatDateTime(preview.scheduledCheckOut)}). Billed in 24-hour blocks, the stay is now ${preview.actual.nights} night(s), not ${preview.booked.nights}.`
                  : `The guest is leaving ${describeGap(preview.minutesFromSchedule)} before the booked checkout (${formatDateTime(preview.scheduledCheckOut)}) — ${preview.actual.nights} of ${preview.booked.nights} booked night(s) used.`}{" "}
                Choose how to bill:
              </div>
              <BillingOption
                selected={billing === "actual"}
                onSelect={() => setBilling("actual")}
                title={overstay ? "Include overstay charges" : "Bill the actual stay"}
                detail={`${preview.actual.nights} night(s), checkout time as now`}
                amount={preview.actual.grandTotal}
              />
              <BillingOption
                selected={billing === "booked"}
                onSelect={() => setBilling("booked")}
                title={overstay ? "Waive the overstay" : "Bill as booked"}
                detail={`${preview.booked.nights} night(s), as reserved`}
                amount={preview.booked.grandTotal}
              />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Checking out within the booked stay — {preview.booked.nights} night(s), as reserved.
            </p>
          )}

          {chosen && (
            <div className="space-y-1.5 rounded-md border border-line-strong bg-card p-3 text-sm shadow-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Grand total</span>
                <span className="font-semibold text-ink">{formatCurrency(chosen.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Paid so far</span>
                <span className="text-ink">-{formatCurrency(preview.advancePaid)}</span>
              </div>
              <div className="my-1 border-t border-line-soft" />
              <div className="flex justify-between font-bold">
                <span className="text-ink">{balance < 0 ? "Overpaid — to refund" : "Balance due"}</span>
                <span className={balance > 0 ? "text-danger" : balance < 0 ? "text-warning" : "text-success"}>{formatCurrency(Math.abs(balance))}</span>
              </div>
            </div>
          )}

          {chosen && balance > 0 && (
            <div className="rounded-md border-2 border-brand bg-brand-tint p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">Collect {formatCurrency(balance)}</p>
              {rows.map((row, i) => (
                <div key={i} className="mb-2 flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      label={i === 0 ? "Payment method" : undefined}
                      options={methodOptions}
                      value={row.methodId}
                      onChange={(v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, methodId: v } : r)))}
                      placeholder="Select method"
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      label={i === 0 ? "Amount" : undefined}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
                    />
                  </div>
                  {rows.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} aria-label="Remove row">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRows((rs) => [...rs, { methodId: "", amount: "" }])}
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <Split className="h-3.5 w-3.5" />
                  Split payment
                </button>
                <p className={`text-xs ${Math.abs(entered - balance) < 0.005 ? "text-success" : "text-danger"}`}>
                  Entered {formatCurrency(entered)} of {formatCurrency(balance)}
                </p>
              </div>
            </div>
          )}

          {chosen && balance < 0 && (
            <div className="rounded-md border-2 border-warning bg-warning-tint p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-warning">Refund {formatCurrency(-balance)} to the guest</p>
              <div className="space-y-2">
                <Select label="Refund method" options={methodOptions} value={refundMethodId} onChange={setRefundMethodId} placeholder="Select method" />
                <Input label="Reference (optional)" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="e.g. UPI ref / handed over in cash" />
              </div>
            </div>
          )}

          {chosen && !settled && (
            <p className="flex items-start gap-1.5 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {balance > 0
                ? "Checkout is blocked until the full balance is collected — enter payment(s) totalling exactly the amount due."
                : "Checkout is blocked until the overpaid amount is refunded — choose how it's paid back."}
            </p>
          )}
          {!billing && preview.differs && <p className="text-xs text-danger">Choose how to bill this stay to continue.</p>}

          {error && <div className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setError(null);
                checkout.mutate();
              }}
              disabled={!settled || checkout.isPending || isFetching}
            >
              <LogOut className="h-4 w-4" />
              {checkout.isPending
                ? "Checking out…"
                : balance > 0
                  ? `Collect ${formatCurrency(balance)} & Check Out`
                  : balance < 0
                    ? `Refund ${formatCurrency(-balance)} & Check Out`
                    : "Check Out & Print Bill"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
