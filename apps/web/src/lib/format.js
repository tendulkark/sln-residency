export function formatCurrency(amount) {
  return `₹${Number(amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Rupees, with paise shown only when there are any — for amounts staff
// have to match exactly (a balance to collect, a refund, a GST line), where
// the whole-rupee formatter above would hide a stray ₹0.50.
export function formatCurrencyExact(amount) {
  const n = Number(amount ?? 0);
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// Paise-precise formatting for GST invoices, where rounded-off rupee
// amounts would make the CGST/SGST split not add back up to the total.
export function formatCurrencyPrecise(amount) {
  return `Rs. ${Number(amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateLike) {
  return new Date(dateLike).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatShortDate(dateLike) {
  return new Date(dateLike).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatTime(dateLike) {
  return new Date(dateLike).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function toDateInputValue(dateLike) {
  const d = new Date(dateLike);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

// HH:MM in the viewer's local time, for an <input type="time"> value.
export function toTimeInputValue(dateLike) {
  const d = new Date(dateLike);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// YYYY-MM-DDTHH:MM in the viewer's local time, for an <input
// type="datetime-local"> value.
export function toDateTimeInputValue(dateLike) {
  return `${toDateInputValue(dateLike)}T${toTimeInputValue(dateLike)}`;
}

export function formatDateTime(dateLike) {
  return new Date(dateLike).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
