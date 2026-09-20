import { cva } from "class-variance-authority";

// Two ways to color a badge:
// - `color` (a hex string) for anything backed by tenant data — a Status
//   row's own `color` column. Never hardcode a status→color mapping here.
// - `tone` for the handful of synthetic UI states that aren't tenant data
//   (e.g. the "reserved"/"closed" room-board buckets, which are computed,
//   not rows in the Status table).
export const TONES = {
  neutral: "#6b7280",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
};

const badge = cva("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium");

export default function Badge({ color, tone = "neutral", dot = true, className = "", children }) {
  // "brand" is the one tone backed by a live CSS variable rather than a
  // literal hex, so it renders via Tailwind's generated utilities instead
  // of the inline-style alpha trick used below.
  if (!color && tone === "brand") {
    return (
      <span className={`${badge()} bg-brand-tint text-brand ${className}`}>
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
        {children}
      </span>
    );
  }

  const resolved = color ?? TONES[tone] ?? TONES.neutral;

  return (
    <span className={`${badge()} ${className}`} style={{ backgroundColor: `${resolved}1a`, color: resolved }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: resolved }} />}
      {children}
    </span>
  );
}
