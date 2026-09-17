import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Split, Tag, Trash2, CalendarPlus, LogIn, XCircle, Printer } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { formatCurrency, formatDateTime } from "../lib/format.js";
import { useAuthStore } from "../store/authStore.js";
import { Badge, Button, Input, Select } from "../ui/index.js";
import Modal from "./Modal.jsx";
import ExtendStayModal from "./ExtendStayModal.jsx";
import InvoiceModal from "./InvoiceModal.jsx";

function AddChargeForm({ type, onAdd, onCancel, pending }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <div className="mt-2 flex items-end gap-2 rounded-md border border-line bg-muted p-3">
      <div className="flex-1">
        <Input placeholder={type === "discount" ? "Reason (e.g. loyalty discount)" : "Description (e.g. Room service)"} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="w-28">
        <Input type="number" min="0" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={pending || !description.trim() || !amount}
        onClick={() => {
          onAdd({ type, description: description.trim(), amount: Number(amount) });
          setDescription("");
          setAmount("");
        }}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export default function ManageStayModal({ bookingId, onClose }) {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const { data: stay, isLoading } = useQuery({ queryKey: ["booking-stay", bookingId], queryFn: () => apiFetch(`/bookings/${bookingId}/stay`) });
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => apiFetch("/payment-methods") });
  const { data: paymentStatuses } = useQuery({ queryKey: ["statuses", "payment"], queryFn: () => apiFetch("/statuses?domain=payment") });
  const methodOptions = useMemo(() => (methods ?? []).map((m) => ({ value: m.id, label: m.name })), [methods]);
  const paidStatus = paymentStatuses?.find((s) => s.code === "paid");

  const [addFormType, setAddFormType] = useState(null); // "charge" | "discount" | null
  const [settleRows, setSettleRows] = useState([{ methodId: "", amount: "" }]);
  const [extendOpen, setExtendOpen] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null); // { autoGenerate } | null
  const [error, setError] = useState(null);

  useEffect(() => {
    if (stay?.summary.balanceDue > 0 && settleRows.length === 1 && !settleRows[0].amount) {
      setSettleRows([{ methodId: "", amount: stay.summary.balanceDue }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stay?.summary.balanceDue]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["booking-stay", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-room-board"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
  }

  const addCharge = useMutation({
    mutationFn: (payload) => apiFetch(`/bookings/${bookingId}/charges`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidateAll();
      setAddFormType(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteCharge = useMutation({
    mutationFn: (chargeId) => apiFetch(`/booking-charges/${chargeId}`, { method: "DELETE" }),
    onSuccess: invalidateAll,
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

  const checkIn = useMutation({
    mutationFn: async () => {
      const bookingStatuses = await apiFetch("/statuses?domain=booking");
      const checkedInStatus = bookingStatuses.find((s) => s.code === "checked_in");
      const now = new Date().toISOString();
      for (const b of stay.bookings) {
        await apiFetch(`/bookings/${b.id}/status`, { method: "PATCH", body: JSON.stringify({ statusId: checkedInStatus.id, actualCheckIn: now }) });
      }
      const validRows = settleRows.filter((r) => r.methodId && Number(r.amount) > 0);
      for (const row of validRows) {
        await apiFetch("/payments", {
          method: "POST",
          body: JSON.stringify({ bookingId, methodId: row.methodId, statusId: paidStatus?.id, amount: Number(row.amount) }),
        });
      }
    },
    onSuccess: () => {
      invalidateAll();
      onClose();
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

  // Only one Dialog is ever mounted at a time — both Manage Stay and the
  // invoice carry [data-print-area] for window.print(), and having both in
  // the DOM at once would print them on top of each other.
  if (invoiceModal) {
    return (
      <InvoiceModal
        bookingId={bookingId}
        autoGenerate={invoiceModal.autoGenerate}
        onClose={() => {
          setInvoiceModal(null);
          if (invoiceModal.closeStayOnDone) onClose();
        }}
      />
    );
  }

  const primary = stay.bookings[0];
  const isCheckedIn = primary.status.code === "checked_in";
  const isCheckedOut = primary.status.code === "checked_out";
  const roomLabel = stay.bookings.map((b) => b.room.roomNumber).join(", ");
  const settleTotal = settleRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <>
      <Modal title={`Manage Stay - Room ${roomLabel}`} onClose={onClose} wide>
        <p className="mb-4 text-sm text-gray-500">
          Guest: {primary.guest.name} {primary.guest.phone && `• Ph: ${primary.guest.phone}`}
        </p>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Billing & Charges</p>

        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <Receipt className="h-4 w-4 text-gray-400" />
              Other Charges (Food, Damages, etc.)
            </p>
            {permissions.has("bookings.edit") && addFormType !== "charge" && (
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
                  {permissions.has("bookings.edit") && (
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

        <div className="mt-3 rounded-md border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <Tag className="h-4 w-4 text-gray-400" />
              Discount / Concession (optional)
            </p>
            {permissions.has("bookings.edit") && addFormType !== "discount" && (
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
                  {permissions.has("bookings.edit") && (
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

        <div className="mt-3 space-y-1.5 rounded-md border border-line p-3 text-sm">
          <Row label="Check-in" value={formatDateTime(primary.checkIn)} />
          <Row label="Check-out" value={formatDateTime(primary.checkOut)} />
          <Row label="Nights stayed" value={`${stay.summary.nights} night(s) · ${stay.bookings.length} room(s)`} />
          <div className="my-1 border-t border-line-soft" />
          {stay.bookings.map((b) => (
            <Row key={b.id} label={`Room ${b.room.roomNumber}`} value={formatCurrency(b.totalAmount)} muted />
          ))}
          <Row label="Rooms total (incl. GST)" value={formatCurrency(stay.summary.roomsInclTax)} />
          <Row label="Taxable value (rooms)" value={formatCurrency(stay.summary.taxableValue)} muted />
          <Row label={`CGST (${stay.summary.taxRatePercent / 2}%) incl.`} value={formatCurrency(stay.summary.cgst)} muted />
          <Row label={`SGST (${stay.summary.taxRatePercent / 2}%) incl.`} value={formatCurrency(stay.summary.sgst)} muted />
          {stay.summary.chargesTotal > 0 && <Row label="Other charges" value={formatCurrency(stay.summary.chargesTotal)} />}
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

        {!isCheckedIn && stay.summary.balanceDue > 0 && permissions.has("payments.record") && (
          <div className="mt-3 rounded-md border border-line p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Settle Balance</p>
            {settleRows.map((row, i) => (
              <div key={i} className="mb-2 flex items-end gap-2">
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
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSettleRows((rows) => [...rows, { methodId: "", amount: "" }])}
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Split className="h-3.5 w-3.5" />
                Split payment
              </button>
              <p className="text-xs text-gray-500">
                Entered: {formatCurrency(settleTotal)} / Due: {formatCurrency(stay.summary.balanceDue)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 print:hidden">
          {!primary.status.isTerminal && (
            <Button variant="ghost" size="sm" onClick={() => setExtendOpen(true)}>
              <CalendarPlus className="h-4 w-4" />
              Extend Stay
            </Button>
          )}
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
            {isCheckedOut && <Badge tone="neutral">Checked-out</Badge>}
            {primary.status.code === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
          </div>
        </div>
      </Modal>

      {extendOpen && <ExtendStayModal booking={primary} onClose={() => setExtendOpen(false)} />}
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
