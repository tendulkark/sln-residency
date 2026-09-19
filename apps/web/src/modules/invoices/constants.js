import { Receipt } from "lucide-react";

// Invoices module constants — its route, sidebar nav entry, and the React
// Query cache keys InvoiceModal/InvoicesPage use to fetch/generate/cancel a
// stay's tax invoice.
export const INVOICES_ROUTE_PATH = "/invoices";

export const INVOICES_NAV_ITEM = {
  to: INVOICES_ROUTE_PATH,
  label: "Invoices",
  permission: "invoices.view",
  icon: Receipt,
};

export const BOOKING_INVOICE_QUERY_KEY = "booking-invoice";
export const bookingInvoiceKey = (bookingId) => [BOOKING_INVOICE_QUERY_KEY, bookingId];

export const INVOICES_LIST_QUERY_KEY = "invoices-list";
export const INVOICE_QUERY_KEY = "invoice";
export const invoiceKey = (invoiceId) => [INVOICE_QUERY_KEY, invoiceId];
