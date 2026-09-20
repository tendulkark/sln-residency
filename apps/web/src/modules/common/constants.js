// Constants shared across every module — nothing here belongs to a single
// domain. Business values (status names, colors, codes) still come from the
// Status table at runtime (AI_RULES.md #1); this only names the React Query
// cache key those lookups are stored under, keyed by the Status.domain
// column ("booking" | "room" | "payment").
export const STATUSES_QUERY_KEY = "statuses";
export const statusesKey = (domain) => [STATUSES_QUERY_KEY, domain];

// Payment method *names* are DB-driven too (PaymentMethod table); this is
// only the cache key their lookup is stored under, used wherever a payment
// is recorded (BookingFormModal, ManageStayModal).
export const PAYMENT_METHODS_QUERY_KEY = "payment-methods";
