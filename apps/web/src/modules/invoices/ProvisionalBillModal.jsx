import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import InvoiceDocument from "@/modules/invoices/InvoiceDocument.jsx";
import { TENANT_QUERY_KEY } from "@/modules/settings/constants.js";
import { bookingInvoiceKey } from "@/modules/invoices/constants.js";

// A print preview for a stay that hasn't checked out yet, sharing the same
// branded InvoiceDocument layout as the final Tax Invoice so a guest never
// gets two different-looking bills. It shows the invoice number reserved
// for this stay at booking time (bookings.routes.js) — genuinely that
// stay's number, not a placeholder — but never itself creates or changes
// an Invoice row; only checkout finalizes one (invoices.routes.js), so
// printing this as many times as the guest pays is always safe and needs
// no invoices.generate permission. A booking from before this feature
// shipped has no reserved invoice yet — the fetch 404s and this just falls
// back to showing no number, exactly like the old behavior.
export default function ProvisionalBillModal({ bookingId, stay, onClose }) {
  const { data: tenant, isLoading } = useQuery({ queryKey: [TENANT_QUERY_KEY], queryFn: () => apiFetch("/tenant") });
  const { data: reserved } = useQuery({
    queryKey: bookingInvoiceKey(bookingId),
    queryFn: () => apiFetch(`/bookings/${bookingId}/invoice`),
    retry: false,
  });

  const invoice = reserved?.invoice ?? { invoiceNumber: null, generatedAt: new Date().toISOString() };

  return (
    <Modal
      title="Provisional Bill"
      onClose={onClose}
      wide
      actions={
        tenant && (
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        )
      }
    >
      {isLoading && <p className="text-sm text-ink-muted">Preparing bill…</p>}
      {tenant && (
        <InvoiceDocument
          provisional
          invoice={invoice}
          tenant={tenant}
          bookings={stay.bookings}
          charges={stay.charges}
          payments={stay.payments}
          summary={stay.summary}
        />
      )}
    </Modal>
  );
}
