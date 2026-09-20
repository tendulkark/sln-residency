import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Split, Tag, Trash2, CalendarPlus, LogIn, XCircle, Printer, Pencil, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrency, formatDateTime, toDateTimeInputValue } from "@/lib/format.js";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Badge, Button, GstCalculator, Input, Select, computeGst, GST_MODE } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import ExtendStayModal from "@/modules/reservations/ExtendStayModal.jsx";
import EditBookingModal from "@/modules/reservations/EditBookingModal.jsx";
import InvoiceModal from "@/modules/invoices/InvoiceModal.jsx";
import ProvisionalBillModal from "@/modules/invoices/ProvisionalBillModal.jsx";
import { bookingStayKey, BOOKINGS_QUERY_KEY } from "@/modules/reservations/constants.js";
import { PAYMENT_METHODS_QUERY_KEY } from "@/modules/payments/constants.js";
import { statusesKey } from "@/modules/common/constants.js";
import { DASHBOARD_ROOM_BOARD_QUERY_KEY, DASHBOARD_SUMMARY_QUERY_KEY } from "@/modules/dashboard/constants.js";
import { ROOMS_QUERY_KEY } from "@/modules/rooms/constants.js";
import { bookingInvoiceKey } from "@/modules/invoices/constants.js";

function AddChargeForm({ type, onAdd, onCancel, pending }) {
  const [description, setDescription] = useState("");
  const [gst, setGst] = useState({ amount: "", ratePercent: "", mode: GST_MODE.EXCLUDE });
  const result = computeGst(gst.amount, gst.ratePercent, gst.mode);
  // A charge is billed to the guest, so what's saved is always the
  // GST-inclusive amount (matches Booking.totalAmount's convention).
  const amount = result.inclusiveAmount;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-muted p-3">
      <Input
        placeholder={type === "discount" ? "Reason (e.g. loyalty discount)" : "Description (e.g. Room service)"}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {type === "discount" ? (
        <Input type="number" min="0" step="0.01" placeholder="Amount" value={gst.amount} onChange={(e) => setGst({ ...gst, amount: e.target.value })} />
      ) : (
        <GstCalculator
          compact
          amount={gst.amount}
          ratePercent={gst.ratePercent}
          mode={gst.mode}
          onAmountChange={(v) => setGst({ ...gst, amount: v })}
          onRateChange={(v) => setGst({ ...gst, ratePercent: v })}
          onModeChange={(v) => setGst({ ...gst, mode: v })}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          disabled={pending || !description.trim() || !amount}
          onClick={() => {
            onAdd({
              type,
              description: description.trim(),
              amount: type === "discount" ? Number(gst.amount) : amount,
              ...(type === "charge" && Number(gst.ratePercent) > 0 ? { taxRatePercent: Number(gst.ratePercent) } : {}),
            });
            setDescription("");
            setGst({ amount: "", ratePercent: "", mode: GST_MODE.EXCLUDE });
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function ManageStayModal({ bookingId, onClose }) {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const { data: stay, isLoading } = useQuery({ queryKey: bookingStayKey(bookingId), queryFn: () => apiFetch(`/bookings/${bookingId}/stay`) });
  const { data: methods } = useQuery({ queryKey: [PAYMENT_METHODS_QUERY_KEY], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: statusesKey("payment"), queryFn: () => apiFetch("/statuses?domain=payment") });
  // Only to know whether a *finalized* invoice already exists, so a
  // correction made after checkout can offer "Reissue Invoice" instead of
  // leaving the printed document silently stale — shares its query key with
  // InvoiceModal's own fetch, so the two stay in sync automatically.
  const { data: invoiceData } = useQuery({ queryKey: bookingInvoiceKey(bookingId), queryFn: () => apiFetch(`/bookings/${bookingId}/invoice`), retry: false });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);
  const paidStatus = paymentStatuses?.find((s) => s.code === "paid");
  // Computed early (not just further down alongside `primary`) because the
  // mutations below need it in their onSuccess handlers, and the backend's
  // own lock (bookings.routes.js/payments.routes.js) uses this exact
  // definition — a checked-out stay's charges/payments/details are locked
  // to ordinary edits, `bookings.correct` (admin-only by default) is the
  // deliberate override (see billing.js `isBookingLocked`).
  const isCheckedOut = stay?.bookings?.[0]?.status?.code === "checked_out";
  const canCorrect = permissions.has("bookings.correct");
  const financialActionsAllowed = !isCheckedOut || canCorrect;

  const [addFormType, setAddFormType] = useState(null); // "charge" | "discount" | null
  const [settleRows, setSettleRows] = useState([{ methodId: "", amount: "", paidAt: toDateTimeInputValue(new Date()) }]);
  const [extendOpen, setExtendOpen] = useState(false);
  const [editStayOpen, setEditStayOpen] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null); // { autoGenerate, closeStayOnDone, autoReissueReason? } | null
  const [provisionalBillOpen, setProvisionalBillOpen] = useState(false);
  const [error, setError] = useState(null);
  // Set once an admin corrects something on an already-checked-out stay
  // (bookings.correct) — local to this sitting, not persisted, since it
  // only exists to prompt "the invoice you just made stale is right here."
  const [changedSinceCheckout, setChangedSinceCheckout] = useState(false);

  useEffect(() => {
    if (stay?.summary.balanceDue > 0 && settleRows.length === 1 && !settleRows[0].amount) {
      setSettleRows([{ methodId: "", amount: stay.summary.balanceDue, paidAt: toDateTimeInputValue(new Date()) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stay?.summary.balanceDue]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: bookingStayKey(bookingId) });
    queryClient.invalidateQueries({ queryKey: [BOOKINGS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [DASHBOARD_ROOM_BOARD_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [DASHBOARD_SUMMARY_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY] });
  }

  const addCharge = useMutation({
    mutationFn: (payload) => apiFetch(`/bookings/${bookingId}/charges`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidateAll();
      setAddFormType(null);
      if (isCheckedOut) setChangedSinceCheckout(true);
    },
    onError: (err) => setError(err.message),
  });

  const deleteCharge = useMutation({
    mutationFn: (chargeId) => apiFetch(`/booking-charges/${chargeId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateAll();
      if (isCheckedOut) setChangedSinceCheckout(true);
    },
    onError: (err) => setError(err.message),
  });

  const cancelBooking = useMutation({
    mutationFn: async () => {
      const bookingStatuses = await apiFetch("/statuses?domain=booking");
      const cancelledStatus = bookingStatuses.find((s) => s.code === "cancelled");
      for (const b of stay.bookings) {
        await apiFetch(`/bookings/${b.id}/status`, { method: "PATCH", body: JSON.stringify({ statusId: cancelledStatus.id }) });
      }
    },
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  // Shared by the "Check In" action (which bundles whatever advance is
  // entered alongside the status change) and the standalone "Record
  // Payment" action, available any time there's a balance due — before
  // check-in (guest pays more ahead of arrival), mid-stay, or at final
  // settlement — since a guest doesn't always pay at the moment staff
  // happens to be looking at this screen, each row carries its own
  // "paid on" time instead of always defaulting to now.
  async function submitSettleRows() {
    const validRows = settleRows.filter((r) => r.methodId && Number(r.amount) > 0);
    for (const row of validRows) {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          bookingId,
          methodId: row.methodId,
          statusId: paidStatus?.id,
          amount: Number(row.amount),
          ...(row.paidAt ? { paidAt: new Date(row.paidAt).toISOString() } : {}),
        }),
      });
    }
  }

  const checkIn = useMutation({
    mutationFn: async () => {
      const bookingStatuses = await apiFetch("/statuses?domain=booking");
      const checkedInStatus = bookingStatuses.find((s) => s.code === "checked_in");
      const now = new Date().toISOString();
      for (const b of stay.bookings) {
        await apiFetch(`/bookings/${b.id}/status`, { method: "PATCH", body: JSON.stringify({ statusId: checkedInStatus.id, actualCheckIn: now }) });
      }
      await submitSettleRows();
    },
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const recordPayment = useMutation({
    mutationFn: submitSettleRows,
    onSuccess: () => {
      invalidateAll();
      setSettleRows([{ methodId: "", amount: "", paidAt: toDateTimeInputValue(new Date()) }]);
      if (isCheckedOut) setChangedSinceCheckout(true);
    },
    onError: (err) => setError(err.message),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      const bookingStatuses = await apiFetch("/statuses?domain=booking");
      const checkedOutStatus = bookingStatuses.find((s) => s.code === "checked_out");
      const now = new Date().toISOString();
      for (const b of stay.bookings) {
        await apiFetch(`/bookings/${b.id}/status`, { method: "PATCH", body: JSON.stringify({ statusId: checkedOutStatus.id, actualCheckOut: now }) });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setInvoiceModal({ autoGenerate: true, closeStayOnDone: true });
    },
    onError: (err) => setError(err.message),
  });

  if (isLoading || !stay) {
    return (
      <Modal title="Manage Stay" onClose={onClose}>
        <p className="text-sm text-gray-500">Loading…</p>
      </Modal>
    );
  }

  // Only one Dialog is ever mounted at a time — Manage Stay, the invoice,
  // and the provisional bill all carry [data-print-area] for window.print(),
  // and having more than one in the DOM at once would print them on top of
  // each other.
  if (invoiceModal) {
    return (
      <InvoiceModal
        bookingId={bookingId}
        autoGenerate={invoiceModal.autoGenerate}
        autoReissueReason={invoiceModal.autoReissueReason}
        onReissued={() => setChangedSinceCheckout(false)}
        onClose={() => {
          setInvoiceModal(null);
          if (invoiceModal.closeStayOnDone) onClose();
        }}
      />
    );
  }

  if (provisionalBillOpen) {
    return <ProvisionalBillModal bookingId={bookingId} stay={stay} onClose={() => setProvisionalBillOpen(false)} />;
  }

  const primary = stay.bookings[0];
  const isCheckedIn = primary.status.code === "checked_in";
  const roomLabel = stay.bookings.map((b) => b.room.roomNumber).join(", ");
  const settleTotal = settleRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <>
      <Modal title={`Manage Stay - Room ${roomLabel}`} onClose={onClose} wide>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">
            Guest: <span className="font-medium text-gray-900">{primary.guest.name}</span>{" "}
            {primary.guest.phone && `• Ph: ${primary.guest.phone}`}
          </p>
          <Badge color={primary.status.color}>{primary.status.label}</Badge>
        </div>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">Billing & Charges</p>

        <div className="rounded-md border border-line-strong bg-muted p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Receipt className="h-4 w-4 text-brand" />
              Other Charges (Food, Damages, etc.)
            </p>
            {financialActionsAllowed && permissions.has("bookings.edit") && addFormType !== "charge" && (
              <Button size="sm" variant="outline" className="print:hidden" onClick={() => setAddFormType("charge")}>
                <Plus className="h-3.5 w-3.5" />
                Add Charge
              </Button>
            )}
          </div>

          {stay.charges.filter((c) => c.type === "charge").length === 0 && addFormType !== "charge" && (
            <p className="mt-2 text-xs text-gray-500">No charges yet — tap Add Charge to record food, damages, laundry, etc. Each entry is saved instantly.</p>
          )}
          {stay.charges
            .filter((c) => c.type === "charge")
            .map((c) => (
              <div key={c.id} className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">{c.description}</span>
                <span className="flex items-center gap-2">
                  {formatCurrency(c.amount)}
                  {financialActionsAllowed && permissions.has("bookings.edit") && (
                    <button onClick={() => deleteCharge.mutate(c.id)} className="text-gray-300 hover:text-red-600 print:hidden" aria-label="Remove charge">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          {addFormType === "charge" && (
            <AddChargeForm type="charge" pending={addCharge.isPending} onAdd={(p) => addCharge.mutate(p)} onCancel={() => setAddFormType(null)} />
          )}
        </div>

        <div className="mt-3 rounded-md border border-line-strong bg-gold-tint p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Tag className="h-4 w-4 text-gold-dark" />
              Discount / Concession (optional)
            </p>
            {financialActionsAllowed && permissions.has("bookings.edit") && addFormType !== "discount" && (
              <Button size="sm" variant="outline" className="print:hidden" onClick={() => setAddFormType("discount")}>
                <Plus className="h-3.5 w-3.5" />
                Add Discount
              </Button>
            )}
          </div>
          {stay.charges
            .filter((c) => c.type === "discount")
            .map((c) => (
              <div key={c.id} className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">{c.description}</span>
                <span className="flex items-center gap-2">
                  -{formatCurrency(c.amount)}
                  {financialActionsAllowed && permissions.has("bookings.edit") && (
                    <button onClick={() => deleteCharge.mutate(c.id)} className="text-gray-300 hover:text-red-600 print:hidden" aria-label="Remove discount">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          {addFormType === "discount" && (
            <AddChargeForm type="discount" pending={addCharge.isPending} onAdd={(p) => addCharge.mutate(p)} onCancel={() => setAddFormType(null)} />
          )}
        </div>

        <div className="mt-3 space-y-1.5 rounded-md border border-line-strong bg-card p-3 text-sm shadow-sm">
          <Row label="Check-in" value={formatDateTime(primary.checkIn)} />
          <Row label="Check-out" value={formatDateTime(primary.checkOut)} />
          <Row label="Nights stayed" value={`${stay.summary.nights} night(s) · ${stay.bookings.length} room(s)`} />
          <div className="my-1 border-t border-line-soft" />
          {stay.bookings.map((b) => (
            <Row key={b.id} label={`Room ${b.room.roomNumber}`} value={formatCurrency(b.totalAmount)} muted />
          ))}
          <Row label="Rooms total (incl. GST)" value={formatCurrency(stay.summary.roomsInclTax)} />
          <Row label="Taxable value" value={formatCurrency(stay.summary.taxableValue)} muted />
          <Row
            label={stay.summary.chargesTaxAmount > 0 ? "CGST incl." : `CGST (${stay.summary.taxRatePercent / 2}%) incl.`}
            value={formatCurrency(stay.summary.cgst)}
            muted
          />
          <Row
            label={stay.summary.chargesTaxAmount > 0 ? "SGST incl." : `SGST (${stay.summary.taxRatePercent / 2}%) incl.`}
            value={formatCurrency(stay.summary.sgst)}
            muted
          />
          {stay.summary.chargesTotal > 0 && (
            <Row
              label={stay.summary.chargesTaxAmount > 0 ? `Other charges (GST ${formatCurrency(stay.summary.chargesTaxAmount)} incl.)` : "Other charges"}
              value={formatCurrency(stay.summary.chargesTotal)}
            />
          )}
          {stay.summary.discountTotal > 0 && <Row label="Discount" value={`-${formatCurrency(stay.summary.discountTotal)}`} />}
          <div className="my-1 border-t border-line-soft" />
          <Row label="Grand total" value={formatCurrency(stay.summary.grandTotal)} bold />
          <Row label="Advance paid" value={`-${formatCurrency(stay.summary.advancePaid)}`} />
          <div className="my-1 border-t border-line-soft" />
          <Row
            label="Final balance due"
            value={formatCurrency(stay.summary.balanceDue)}
            bold
            valueClassName={stay.summary.balanceDue > 0 ? "text-red-600" : "text-emerald-600"}
          />
        </div>

        {stay.payments.length > 0 && (
          <div className="mt-3 rounded-md border border-line-strong bg-muted p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">Payment History</p>
            {stay.payments.map((p) => (
              <div key={p.id} className="mt-1 flex items-center justify-between text-sm first:mt-0">
                <span className="text-gray-700">
                  {p.method.name} · {formatDateTime(p.recordedAt)}
                </span>
                <span className="font-medium text-gray-900">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {isCheckedOut && changedSinceCheckout && invoiceData?.invoice?.isFinalized && !invoiceData.invoice.isCancelled && permissions.has("invoices.cancel") && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
            <span>Corrected after checkout — Invoice {invoiceData.invoice.invoiceNumber} still shows the old figures.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInvoiceModal({ autoGenerate: false, closeStayOnDone: false, autoReissueReason: "Stay details corrected after checkout" })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reissue Invoice
            </Button>
          </div>
        )}

        {financialActionsAllowed && stay.summary.balanceDue > 0 && permissions.has("payments.record") && (
          <div className="mt-3 rounded-md border-2 border-brand bg-brand-tint p-3 shadow-sm print:hidden">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand/75">Settle Balance</p>
            {settleRows.map((row, i) => (
              <div key={i} className="mb-2 space-y-2 rounded-md border border-line bg-card p-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      label={i === 0 ? "Payment method" : undefined}
                      options={methodOptions}
                      value={row.methodId}
                      onChange={(v) => setSettleRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, methodId: v } : r)))}
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
                      onChange={(e) => setSettleRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
                    />
                  </div>
                  {settleRows.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setSettleRows((rows) => rows.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Input
                  label="Paid on"
                  type="datetime-local"
                  value={row.paidAt}
                  onChange={(e) => setSettleRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, paidAt: e.target.value } : r)))}
                />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSettleRows((rows) => [...rows, { methodId: "", amount: "", paidAt: toDateTimeInputValue(new Date()) }])}
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Split className="h-3.5 w-3.5" />
                Split payment
              </button>
              <p className="text-xs text-gray-500">
                Entered: {formatCurrency(settleTotal)} / Due: {formatCurrency(stay.summary.balanceDue)}
              </p>
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending || settleTotal <= 0}>
                {recordPayment.isPending ? "Recording…" : "Record Payment"}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted p-3 print:hidden">
          <div className="flex gap-1">
            {financialActionsAllowed && permissions.has("bookings.edit") && (
              <Button variant="ghost" size="sm" onClick={() => setEditStayOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit Stay Details
              </Button>
            )}
            {!primary.status.isTerminal && (
              <Button variant="ghost" size="sm" onClick={() => setExtendOpen(true)}>
                <CalendarPlus className="h-4 w-4" />
                Extend Stay
              </Button>
            )}
            {!isCheckedOut && (
              <Button variant="ghost" size="sm" onClick={() => setProvisionalBillOpen(true)}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {!isCheckedIn && permissions.has("bookings.cancel") && !primary.status.isTerminal && (
              <Button variant="danger" size="sm" onClick={() => cancelBooking.mutate()} disabled={cancelBooking.isPending}>
                <XCircle className="h-4 w-4" />
                Cancel Booking
              </Button>
            )}
            {!isCheckedIn && !primary.status.isTerminal && permissions.has("bookings.edit") && (
              <Button variant="success" size="sm" onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
                <LogIn className="h-4 w-4" />
                {checkIn.isPending ? "Checking in…" : "Check In"}
              </Button>
            )}
            {isCheckedIn && permissions.has("bookings.edit") && (
              <Button variant="danger" size="sm" onClick={() => checkOut.mutate()} disabled={checkOut.isPending}>
                <Printer className="h-4 w-4" />
                {checkOut.isPending ? "Checking out…" : "Checkout & Print Bill"}
              </Button>
            )}
            {isCheckedOut && permissions.has("invoices.view") && (
              <Button variant="outline" size="sm" onClick={() => setInvoiceModal({ autoGenerate: false, closeStayOnDone: false })}>
                <Printer className="h-4 w-4" />
                Print Bill
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {extendOpen && <ExtendStayModal booking={primary} onClose={() => setExtendOpen(false)} />}
      {editStayOpen && (
        <EditBookingModal
          booking={primary}
          onClose={() => setEditStayOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: bookingStayKey(bookingId) });
            if (isCheckedOut) setChangedSinceCheckout(true);
          }}
        />
      )}
    </>
  );
}

function Row({ label, value, bold, muted, valueClassName = "" }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${muted ? "text-xs text-gray-400" : "text-gray-600"} ${bold ? "font-semibold text-gray-900" : ""}`}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${muted ? "text-xs text-gray-400" : "text-gray-900"} ${valueClassName}`}>{value}</span>
    </div>
  );
}
