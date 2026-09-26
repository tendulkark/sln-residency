import { formatCurrencyExact, formatDateTime } from "@/lib/format.js";

// Plain-English wording for the Audit Log. The action codes themselves come
// from the API (recordAudit calls); this only phrases them for people. An
// action not listed here still shows, spelled out from its code.
const ACTION_LABELS = {
  "booking.create": "Created a booking",
  "booking.update": "Edited a booking",
  "booking.status_change": "Changed a booking's status",
  "bookingcharge.create": "Added a charge",
  "bookingcharge.discount": "Gave a discount",
  "bookingcharge.delete": "Removed a charge",
  "guest.create": "Added a guest",
  "guest.update": "Edited a guest",
  "guest.correct": "Corrected guest details",
  "invoice.reserve": "Reserved an invoice number",
  "invoice.finalize": "Finalized an invoice",
  "invoice.cancel": "Cancelled & reissued an invoice",
  "invoicetemplate.update": "Changed the invoice design",
  "payment.record": "Recorded a payment",
  "payment.refund": "Recorded a refund",
  "room.create": "Added a room",
  "room.update": "Edited a room",
  "room.delete": "Deleted a room",
  "room.status_change": "Changed a room's status",
  "roomclosure.create": "Closed a room for dates",
  "roomclosure.delete": "Reopened a closed room",
  "roomtype.create": "Added a room type",
  "roomtype.update": "Edited a room type",
  "roomtype.delete": "Deleted a room type",
  "tenant.update": "Updated the hotel profile",
  "user.create": "Added a staff account",
  "user.update": "Edited a staff account",
  "user.reset_password": "Reset a staff password",
  "user.change_password": "Changed their own password",
  "user.session_revoke": "Signed out a device",
  "user.session_revoke_others": "Signed out other devices",
  "role.create": "Created a role",
  "role.update": "Changed a role",
  "role.delete": "Deleted a role",
  "status.update": "Edited a status",
  "status.reorder": "Reordered statuses",
  "paymentmethod.create": "Added a payment method",
  "paymentmethod.update": "Edited a payment method",
  "paymentmethod.delete": "Deleted a payment method",
  "taxrule.create": "Added a tax rule",
  "taxrule.update": "Edited a tax rule",
  "taxrule.delete": "Deleted a tax rule",
};

const ENTITY_LABELS = {
  Booking: "Bookings",
  BookingCharge: "Charges & discounts",
  Guest: "Guests",
  Invoice: "Invoices",
  InvoiceTemplate: "Invoice design",
  Payment: "Payments",
  Room: "Rooms",
  RoomClosure: "Room closures",
  RoomType: "Room types",
  Tenant: "Hotel profile",
  User: "Staff accounts",
  Role: "Roles",
  Status: "Statuses",
  PaymentMethod: "Payment methods",
  TaxRule: "Tax rules",
};

const words = (code) => String(code).replace(/[._]/g, " ");
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function actionLabel(action) {
  return ACTION_LABELS[action] ?? capitalize(words(action));
}

export function entityTypeLabel(type) {
  return ENTITY_LABELS[type] ?? type;
}

// One short line of what changed, from the fields most rows carry.
export function summarize(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata;
  const parts = [];
  if (m.statusCode) parts.push(`→ ${words(m.statusCode)}`);
  if (m.invoiceNumber) parts.push(m.invoiceNumber);
  if (m.amount != null) parts.push(formatCurrencyExact(m.amount));
  else if (m.total != null) parts.push(formatCurrencyExact(m.total));
  if (m.renamed) parts.push(`Renamed “${m.renamed.from}” → “${m.renamed.to}”`);
  if (m.granted || m.revoked) {
    const g = m.granted?.length ?? 0;
    const r = m.revoked?.length ?? 0;
    if (g || r) parts.push([g && `+${g} permission${g === 1 ? "" : "s"}`, r && `−${r} permission${r === 1 ? "" : "s"}`].filter(Boolean).join(", "));
  }
  if (Array.isArray(m.after)) {
    parts.push(`New order: ${m.after.map(words).join(", ")}`);
  } else if (m.before && m.after && typeof m.after === "object") {
    const changed = Object.keys(m.after).filter((k) => JSON.stringify(m.after[k]) !== JSON.stringify(m.before[k]));
    if (changed.length) parts.push(`Changed ${changed.map(words).join(", ")}`);
  }
  if (!parts.length && m.name) parts.push(m.name);
  if (!parts.length && m.reason) parts.push(m.reason);
  return parts.slice(0, 3).join(" · ");
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// A metadata value as display text (nested objects are handled by the
// detail view, not here).
export function displayValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && ISO_DATETIME.test(value)) return formatDateTime(value);
  if (Array.isArray(value) && value.every((v) => typeof v !== "object")) return value.length ? value.join(", ") : "—";
  return String(value);
}

export function fieldLabel(key) {
  return capitalize(
    String(key)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._]/g, " ")
      .toLowerCase()
  );
}
