import { addDays, endOfMonth, endOfYear, startOfDay, startOfMonth, startOfWeek, startOfYear, toISODate } from "@/lib/dateRange.js";

// The period a report covers, and how it's kept in the page's URL
// (?tab=gst&period=month&date=2026-09-01, or period=custom&from=…&to=…),
// so a reload, a bookmark or a shared link reopens the same view and the
// browser's Back button steps between the views someone looked at.
// Weeks start on Sunday, the same as the Dashboard and Reservations.

export const REPORT_TABS = ["bookings", "revenue", "occupancy", "gst"];

export const PERIOD_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

const PERIODS = new Set(PERIOD_OPTIONS.map((p) => p.value));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseISODate(value) {
  if (!ISO_DATE.test(value ?? "")) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// [start, end) for a named period containing `anchor`.
function bounds(period, anchor) {
  if (period === "day") return [startOfDay(anchor), addDays(startOfDay(anchor), 1)];
  if (period === "week") return [startOfWeek(anchor), addDays(startOfWeek(anchor), 7)];
  if (period === "year") return [startOfYear(anchor), endOfYear(anchor)];
  return [startOfMonth(anchor), endOfMonth(anchor)];
}

export function readReportParams(searchParams) {
  const tab = REPORT_TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : REPORT_TABS[0];
  const period = PERIODS.has(searchParams.get("period")) ? searchParams.get("period") : "month";
  const anchor = parseISODate(searchParams.get("date")) ?? startOfDay(new Date());

  if (period === "custom") {
    const from = parseISODate(searchParams.get("from"));
    const to = parseISODate(searchParams.get("to"));
    if (from && to && from <= to) return { tab, period, anchor, from: toISODate(from), to: toISODate(to) };
    // A hand-edited or half-filled custom URL falls back to this month.
    const [start, end] = bounds("month", anchor);
    return { tab, period, anchor, from: toISODate(start), to: toISODate(addDays(end, -1)) };
  }

  const [start, end] = bounds(period, anchor);
  return { tab, period, anchor, from: toISODate(start), to: toISODate(addDays(end, -1)) };
}

export function writeReportParams({ tab, period, anchor, from, to }) {
  const params = { tab, period };
  if (period === "custom") Object.assign(params, { from, to });
  else params.date = toISODate(bounds(period, anchor)[0]);
  return params;
}

// ‹ / › — one whole period back or forward.
export function stepAnchor(period, anchor, direction) {
  const d = new Date(anchor);
  if (period === "day") return addDays(d, direction);
  if (period === "week") return addDays(d, 7 * direction);
  if (period === "year") return new Date(d.getFullYear() + direction, 0, 1);
  return new Date(d.getFullYear(), d.getMonth() + direction, 1);
}

export function isCurrentPeriod(period, anchor) {
  const [start, end] = bounds(period, anchor);
  const now = new Date();
  return now >= start && now < end;
}

const fmt = (d, opts) => d.toLocaleDateString("en-IN", opts);

export function periodLabel(period, anchor) {
  const [start, end] = bounds(period, anchor);
  if (period === "day") return fmt(start, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (period === "week") {
    const last = addDays(end, -1);
    const sameMonth = start.getMonth() === last.getMonth();
    // The year only when it isn't this one, so the label fits its button.
    const withYear = last.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {};
    return `${fmt(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short", ...withYear })}`;
  }
  if (period === "year") return String(start.getFullYear());
  return fmt(start, { month: "long", year: "numeric" });
}

// A human description of any range — the print header and empty states.
export function rangeLabel(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (from === to) return fmt(a, { day: "numeric", month: "long", year: "numeric" });
  return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function rangeDays(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86_400_000) + 1;
}

// How finely a trend chart splits a range: a bar per day up to about a
// month and a half, per week up to about half a year, per month beyond.
export function bucketFor(from, to) {
  const days = rangeDays(from, to);
  if (days <= 45) return "day";
  if (days <= 190) return "week";
  return "month";
}

function bucketKey(dateISO, bucket) {
  const d = new Date(`${dateISO}T00:00:00`);
  if (bucket === "week") return toISODate(startOfWeek(d));
  if (bucket === "month") return toISODate(startOfMonth(d));
  return dateISO;
}

export function bucketLabel(keyISO, bucket, { long = false } = {}) {
  const d = new Date(`${keyISO}T00:00:00`);
  if (bucket === "month") return fmt(d, long ? { month: "long", year: "numeric" } : { month: "short" });
  if (bucket === "week") return long ? `Week of ${fmt(d, { day: "numeric", month: "short" })}` : fmt(d, { day: "numeric", month: "short" });
  return long ? fmt(d, { weekday: "short", day: "numeric", month: "short" }) : fmt(d, { day: "numeric" });
}

// Rolls daily rows up into `bucket`-sized rows. `combine(acc, row)` folds
// one day into its bucket's accumulator (seeded by `seed()`); days keep
// their order, so buckets come out in date order too.
export function bucketize(daily, bucket, seed, combine) {
  const buckets = new Map();
  for (const row of daily) {
    const key = bucketKey(row.date, bucket);
    if (!buckets.has(key)) buckets.set(key, seed(key));
    combine(buckets.get(key), row);
  }
  return [...buckets.values()];
}
