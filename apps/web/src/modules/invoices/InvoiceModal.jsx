import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import InvoiceDocument from "@/modules/invoices/InvoiceDocument.jsx";
import { bookingInvoiceKey } from "@/modules/invoices/constants.js";

// Fetches (or generates, on first checkout) the tax invoice for a booking
// and shows it in a printable dialog. Reused both right after "Checkout &
// Print Bill" and for reprinting a settled stay later — GET is idempotent
// once an invoice exists, POST only creates one the first time
// (invoices.routes.js).
export default function InvoiceModal({ bookingId, autoGenerate = false, onClose }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: bookingInvoiceKey(bookingId),
    queryFn: () => apiFetch(`/bookings/${bookingId}/invoice`),
    retry: false,
    enabled: !autoGenerate,
  });

  const generate = useMutation({
    mutationFn: () => apiFetch(`/bookings/${bookingId}/invoice`, { method: "POST", body: "{}" }),
    onSuccess: (invoice) => queryClient.setQueryData(bookingInvoiceKey(bookingId), invoice),
  });

  useEffect(() => {
    if (autoGenerate) generate.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, bookingId]);

  const invoice = data ?? generate.data;
  const loading = autoGenerate ? generate.isPending : isLoading;
  const loadError = autoGenerate ? generate.error : error;

  return (
    <Modal
      title="Tax Invoice"
      onClose={onClose}
      wide
      actions={
        invoice && (
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        )
      }
    >
      {loading && <p className="text-sm text-gray-500">Preparing invoice…</p>}
      {loadError && <p className="text-sm text-red-600">{loadError.message}</p>}
      {invoice && <InvoiceDocument {...invoice} />}
    </Modal>
  );
}
