// Payments module constants — the React Query cache keys used by
// RecordPaymentModal, BookingFormModal, and ManageStayModal for payment
// methods and recorded payments. Payment method *names* stay DB-driven
// (AI_RULES.md #1) — this only names the cache key their lookup is stored
// under, never the methods themselves.
export const PAYMENT_METHODS_QUERY_KEY = "payment-methods";
export const PAYMENTS_QUERY_KEY = "payments";
