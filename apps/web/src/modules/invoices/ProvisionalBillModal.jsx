import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { Button } from "@/ui/index.js";
import Modal from "@/ui/Dialog.jsx";
import InvoiceDocument from "@/modules/invoices/InvoiceDocument.jsx";
import { TENANT_QUERY_KEY } from "@/modules/settings/constants.js";

// A print preview for a stay that hasn't checked out yet, sharing the same
// branded InvoiceDocument layout as the final Tax Invoice so a guest never
// gets two different-looking bills. Unlike InvoiceModal, this never touches
// the Invoice table — that only happens at "Checkout & Print Bill" — so
// printing this as many times as the guest pays never consumes an invoice
// number or needs invoices.generate permission.
export default function ProvisionalBillModal({ stay, onClose }) {
  const { data: tenant, isLoading } = useQuery({ queryKey: [TENANT_QUERY_KEY], queryFn: () => apiFetch("/tenant") });

  const invoice = { invoiceNumber: "PROVISIONAL", generatedAt: new Date().toISOString() };

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
      {isLoading && <p className="text-sm text-gray-500">Preparing bill…</p>}
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
