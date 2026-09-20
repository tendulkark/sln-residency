import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Ban, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Button, Textarea } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import InvoiceDocument from "@/modules/invoices/InvoiceDocument.jsx";
import GuestDetailsForm from "@/modules/invoices/GuestDetailsForm.jsx";
import { bookingInvoiceKey, invoiceKey, INVOICES_LIST_QUERY_KEY } from "@/modules/invoices/constants.js";
import { GUESTS_QUERY_KEY } from "@/modules/reservations/constants.js";

const GUEST_FIELD_LABELS = {
  name: "Name",
  phone: "Phone",
  phone2: "Alternate phone",
  email: "Email",
  address: "Address",
  idProofType: "ID proof type",
  idProofNumber: "ID proof number",
  companyName: "Company name",
  gstin: "Company GSTIN",
};

const normalize = (v) => (v ?? "").toString().trim();

// Fetches (or generates, on first checkout) the tax invoice for a booking
// and shows it in a printable dialog. Reused both right after "Checkout &
// Print Bill" and for reprinting a settled stay later — GET is idempotent
// once an invoice exists, POST only creates one the first time
// (invoices.routes.js). Pass `invoiceId` instead of `bookingId` to view one
// specific invoice by its own id regardless of whether it's still active —
// that's how the Invoices list opens a cancelled (historical) record, which
// the booking-scoped GET deliberately can't resolve.
export default function InvoiceModal({ bookingId, invoiceId, autoGenerate = false, autoReissueReason, onReissued, onClose }) {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [guestForm, setGuestForm] = useState(null);
  // When opened by invoiceId, a successful cancel+reissue needs to swap the
  // displayed invoice to the new one — the id prop itself never changes, so
  // this tracks "which invoice is actually shown" instead of refetching the
  // now-cancelled one forever.
  const [shownInvoiceId, setShownInvoiceId] = useState(invoiceId);

  const byBooking = useQuery({
    queryKey: bookingInvoiceKey(bookingId),
    queryFn: () => apiFetch(`/bookings/${bookingId}/invoice`),
    retry: false,
    enabled: !!bookingId && !autoGenerate,
  });

  const byId = useQuery({
    queryKey: invoiceKey(shownInvoiceId),
    queryFn: () => apiFetch(`/invoices/${shownInvoiceId}`),
    retry: false,
    enabled: !!shownInvoiceId,
  });

  const generate = useMutation({
    mutationFn: () => apiFetch(`/bookings/${bookingId}/invoice`, { method: "POST", body: "{}" }),
    onSuccess: (invoice) => queryClient.setQueryData(bookingInvoiceKey(bookingId), invoice),
  });

  useEffect(() => {
    if (autoGenerate && bookingId) generate.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, bookingId]);

  const cancelAndReissue = useMutation({
    mutationFn: () => apiFetch(`/invoices/${data.invoice.id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: (reissued) => {
      queryClient.invalidateQueries({ queryKey: [INVOICES_LIST_QUERY_KEY] });
      if (bookingId) queryClient.setQueryData(bookingInvoiceKey(bookingId), reissued);
      queryClient.setQueryData(invoiceKey(reissued.invoice.id), reissued);
      if (invoiceId) setShownInvoiceId(reissued.invoice.id);
      setCancelling(false);
      setReason("");
      onReissued?.();
    },
  });

  const data = invoiceId ? byId.data : (byBooking.data ?? generate.data);
  const loading = invoiceId ? byId.isLoading : autoGenerate ? generate.isPending : byBooking.isLoading;
  const loadError = invoiceId ? byId.error : autoGenerate ? generate.error : byBooking.error;
  const invoice = data?.invoice;
  const primaryGuest = data?.bookings?.[0]?.guest;

  // A caller that already knows this invoice needs reissuing (ManageStayModal,
  // after an admin corrects a checked-out stay's dates/rate/charges/payments)
  // can skip straight to the confirm step instead of making the admin click
  // "Cancel & Reissue" again — fires once, the moment the invoice is known to
  // actually be finalized (a reserved one has nothing to reissue).
  const autoReissueFired = useRef(false);
  useEffect(() => {
    if (autoReissueReason && !autoReissueFired.current && invoice?.isFinalized && !invoice.isCancelled) {
      autoReissueFired.current = true;
      setReason(autoReissueReason);
      setCancelling(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReissueReason, invoice?.isFinalized, invoice?.isCancelled]);
  // `bookingId` is only passed by callers that already have it (Reports'
  // Reprint button, ManageStayModal); the Invoices list only knows
  // `invoiceId` and gets the booking id from the fetched invoice instead.
  const effectiveBookingId = bookingId ?? invoice?.bookingId;
  const canCancel = invoice && invoice.isFinalized && !invoice.isCancelled && permissions.has("invoices.cancel");
  // Admin-only (guests.correct isn't in the seeded Employee role) — editing
  // a guest here can retroactively change every *other* invoice this guest
  // has, and for THIS invoice, if it's finalized, it walks straight into
  // Cancel & Reissue below rather than silently rewriting a printed
  // document (AI_RULES.md #4; guests.routes.js `PATCH /guests/:id`).
  const canCorrectGuest = invoice && !invoice.isCancelled && permissions.has("guests.correct");

  // Only the fields that actually changed go in the PATCH body (plus
  // bookingId, kept out of GUEST_FIELD_LABELS so it's never mistaken for an
  // edited field — it's just an audit breadcrumb) — an empty diff means
  // "nothing to save," not "clear every other field."
  const correctGuest = useMutation({
    mutationFn: (payload) => apiFetch(`/guests/${primaryGuest.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setCorrecting(false);
      setGuestForm(null);
      if (effectiveBookingId) queryClient.invalidateQueries({ queryKey: bookingInvoiceKey(effectiveBookingId) });
      if (shownInvoiceId) queryClient.invalidateQueries({ queryKey: invoiceKey(shownInvoiceId) });
      queryClient.invalidateQueries({ queryKey: [GUESTS_QUERY_KEY] });
      // A reserved (not-yet-finalized) invoice just reprints live guest data
      // on the next fetch above — nothing to reissue. A finalized one is
      // frozen, so the only way the correction reaches the printed document
      // is the existing Cancel & Reissue flow; open it pre-armed with a
      // reason so the admin only has to confirm, not re-explain themselves.
      if (invoice?.isFinalized) setCancelling(true);
    },
  });

  function openCorrection() {
    setGuestForm({ ...primaryGuest });
    setCorrecting(true);
  }

  function saveCorrection() {
    const changed = Object.keys(GUEST_FIELD_LABELS).filter((field) => normalize(guestForm[field]) !== normalize(primaryGuest[field]));
    if (changed.length === 0) {
      setCorrecting(false);
      return;
    }
    // guestSchema rejects "" for every optional field (min(1), so a cleared
    // field must be sent as null, not an empty string) — trim and fold "" to
    // null the same way BookingFormModal folds it to `undefined` at create.
    const payload = Object.fromEntries(
      changed.map((field) => {
        const raw = guestForm[field];
        const trimmed = typeof raw === "string" ? raw.trim() : raw;
        return [field, trimmed === "" ? null : trimmed];
      })
    );
    if (effectiveBookingId) payload.bookingId = effectiveBookingId;
    setReason(`Corrected guest details: ${changed.map((field) => GUEST_FIELD_LABELS[field]).join(", ")}`);
    correctGuest.mutate(payload);
  }

  return (
    <Modal
      title="Tax Invoice"
      onClose={onClose}
      wide
      actions={
        data && (
          <>
            {canCorrectGuest && !correcting && !cancelling && (
              <Button size="sm" variant="outline" onClick={openCorrection}>
                <Pencil className="h-3.5 w-3.5" />
                Edit Guest Details
              </Button>
            )}
            {canCancel && !cancelling && !correcting && (
              <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
                <Ban className="h-3.5 w-3.5" />
                Cancel &amp; Reissue
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </>
        )
      }
    >
      {loading && <p className="text-sm text-ink-muted">Preparing invoice…</p>}
      {loadError && <p className="text-sm text-danger">{loadError.message}</p>}

      {invoice?.isCancelled && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger print:hidden">
          <p className="font-semibold">Cancelled {formatDateTime(invoice.cancelledAt)}</p>
          <p>Reason: {invoice.cancellationReason}</p>
          {invoice.supersededBy && <p>Reissued as {invoice.supersededBy.invoiceNumber}.</p>}
        </div>
      )}

      {invoice && !invoice.isFinalized && !invoice.isCancelled && (
        <div className="mb-3 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-sm text-warning print:hidden">
          Number reserved at booking — this becomes a real, final Tax Invoice at checkout.
        </div>
      )}

      {correcting && guestForm && (
        <div className="mb-3 rounded-md border border-line-strong bg-muted p-3 print:hidden">
          <p className="mb-2 text-sm font-semibold text-ink">Edit guest details</p>
          <p className="mb-3 text-xs text-ink-muted">
            {invoice?.isFinalized
              ? "This invoice is already finalized, so saving here will walk you into Cancel & Reissue — the corrected details go on a new invoice, this one stays exactly as printed."
              : "This invoice isn't finalized yet, so the correction just applies directly — no reissue needed."}
          </p>
          <GuestDetailsForm value={guestForm} onChange={setGuestForm} />
          {correctGuest.error && <p className="mt-2 text-sm text-danger">{correctGuest.error.message}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCorrecting(false)} disabled={correctGuest.isPending}>
              Cancel
            </Button>
            <Button size="sm" disabled={!normalize(guestForm.name) || correctGuest.isPending} onClick={saveCorrection}>
              {correctGuest.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {cancelling && (
        <div className="mb-3 rounded-md border border-line-strong bg-muted p-3 print:hidden">
          <p className="mb-2 text-sm font-semibold text-ink">Cancel this invoice and issue a replacement?</p>
          <p className="mb-2 text-xs text-ink-muted">
            The invoice number stays reserved and this record is kept — it's marked cancelled, never deleted. A new invoice with the
            next number is generated immediately with the stay's current figures.
          </p>
          <Textarea placeholder="Reason (required, e.g. wrong GSTIN, charge added after printing)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {cancelAndReissue.error && <p className="mt-2 text-sm text-danger">{cancelAndReissue.error.message}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCancelling(false)} disabled={cancelAndReissue.isPending}>
              Back
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!reason.trim() || cancelAndReissue.isPending}
              onClick={() => cancelAndReissue.mutate()}
            >
              {cancelAndReissue.isPending ? "Cancelling…" : "Confirm Cancel & Reissue"}
            </Button>
          </div>
        </div>
      )}

      {data && <InvoiceDocument {...data} />}
    </Modal>
  );
}
