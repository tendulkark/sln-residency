// Invoices module constants — the React Query cache key InvoiceModal uses
// to fetch/generate a stay's tax invoice.
export const BOOKING_INVOICE_QUERY_KEY = "booking-invoice";
export const bookingInvoiceKey = (bookingId) => [BOOKING_INVOICE_QUERY_KEY, bookingId];
