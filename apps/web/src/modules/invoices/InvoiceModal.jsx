import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Ban } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { useAuthStore } from "@/modules/auth/authStore.js";
import { Button, Textarea } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import InvoiceDocument from "@/modules/invoices/InvoiceDocument.jsx";
import { bookingInvoiceKey, invoiceKey, INVOICES_LIST_QUERY_KEY } from "@/modules/invoices/constants.js";

// Fetches (or generates, on first checkout) the tax invoice for a booking
// and shows it in a printable dialog. Reused both right after "Checkout &
// Print Bill" and for reprinting a settled stay later — GET is idempotent
// once an invoice exists, POST only creates one the first time
// (invoices.routes.js). Pass `invoiceId` instead of `bookingId` to view one
// specific invoice by its own id regardless of whether it's still active —
// that's how the Invoices list opens a cancelled (historical) record, which
// the booking-scoped GET deliberately can't resolve.
export default function InvoiceModal({ bookingId, invoiceId, autoGenerate = false, onClose }) {
  const permissions = useAuthStore((s) => s.permissions);
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
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
    },
  });

  const data = invoiceId ? byId.data : (byBooking.data ?? generate.data);
  const loading = invoiceId ? byId.isLoading : autoGenerate ? generate.isPending : byBooking.isLoading;
  const loadError = invoiceId ? byId.error : autoGenerate ? generate.error : byBooking.error;
  const invoice = data?.invoice;
  const canCancel = invoice && invoice.isFinalized && !invoice.isCancelled && permissions.has("invoices.cancel");

  return (
    <Modal
      title="Tax Invoice"
      onClose={onClose}
      wide
      actions={
        data && (
          <>
            {canCancel && !cancelling && (
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
      {loading && <p className="text-sm text-gray-500">Preparing invoice…</p>}
      {loadError && <p className="text-sm text-red-600">{loadError.message}</p>}

      {invoice?.isCancelled && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          <p className="font-semibold">Cancelled {formatDateTime(invoice.cancelledAt)}</p>
          <p>Reason: {invoice.cancellationReason}</p>
          {invoice.supersededBy && <p>Reissued as {invoice.supersededBy.invoiceNumber}.</p>}
        </div>
      )}

      {invoice && !invoice.isFinalized && !invoice.isCancelled && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          Number reserved at booking — this becomes a real, final Tax Invoice at checkout.
        </div>
      )}

      {cancelling && (
        <div className="mb-3 rounded-md border border-line-strong bg-muted p-3 print:hidden">
          <p className="mb-2 text-sm font-semibold text-gray-900">Cancel this invoice and issue a replacement?</p>
          <p className="mb-2 text-xs text-gray-500">
            The invoice number stays reserved and this record is kept — it's marked cancelled, never deleted. A new invoice with the
            next number is generated immediately with the stay's current figures.
          </p>
          <Textarea placeholder="Reason (required, e.g. wrong GSTIN, charge added after printing)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {cancelAndReissue.error && <p className="mt-2 text-sm text-red-600">{cancelAndReissue.error.message}</p>}
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
