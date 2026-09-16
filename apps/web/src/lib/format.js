export function formatCurrency(amount) {
  return `₹${Number(amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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
