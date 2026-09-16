// Day/Week/Month range helpers shared by Dashboard and Reservations.
// All ranges are [start, end) at midnight local time.

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date) {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export function rangeFor(mode, date) {
  const start = startOfDay(date);
  if (mode === "day") return { start, end: addDays(start, 1) };
  if (mode === "week") {
    const weekStart = startOfWeek(start);
    return { start: weekStart, end: addDays(weekStart, 7) };
  }
  // month view calendar shows full weeks, so pad to the grid boundary
  const monthStart = startOfMonth(start);
  const monthEnd = endOfMonth(start);
  return { start: startOfWeek(monthStart), end: addDays(startOfWeek(addDays(monthEnd, -1)), 7) };
}

// A calendar-date label built from LOCAL date parts. Never use
// toISOString().slice(0, 10) for this — it renders in UTC, which silently
// shifts the label back a day for any positive UTC offset (e.g. IST).
export function toISODate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
