import { Phone, StickyNote } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { Badge, Skeleton } from "@/ui/index.js";

// A booking's summary card — guest, room, phone, notes, and paid/balance —
// shared by the month/week day-detail popover (DayBookingsModal) and the
// Day view's Arrivals/In-House/Departures sections, so the same booking
// looks and behaves the same everywhere it's listed. `tag` is an optional
// operational flag (e.g. "Overdue arrival", "Departing today") shown next
// to the status badge.
export default function BookingRow({ booking: b, summary, onClick, tag }) {
  const Row = onClick ? "button" : "div";
  return (
    <Row
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`block w-full rounded-lg border border-line bg-card p-3 text-left shadow-sm ${onClick ? "transition hover:border-brand" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {b.guest.name} · Room {b.room.roomNumber}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {tag && <Badge tone={tag.tone}>{tag.text}</Badge>}
          <Badge color={b.status.color}>{b.status.label}</Badge>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        {formatDateTime(b.checkIn)} → {formatDateTime(b.checkOut)}
      </p>
      {b.guest.phone && (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
          <Phone className="h-3 w-3 shrink-0" />
          {b.guest.phone}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-2 py-1.5 text-xs">
        <span className="text-ink-muted">
          Total <span className="font-semibold text-ink">{formatCurrency(summary ? summary.grandTotal : b.totalAmount)}</span>
        </span>
        <span className="text-ink-muted">
          Paid{" "}
          {summary ? (
            <span className="font-semibold text-ink">{formatCurrency(summary.advancePaid)}</span>
          ) : (
            <Skeleton className="inline-block h-3 w-12 align-middle" />
          )}
        </span>
        {summary ? (
          <span className={`font-semibold ${summary.balanceDue > 0 ? "text-danger" : summary.balanceDue < 0 ? "text-warning" : "text-success"}`}>
            {summary.balanceDue > 0
              ? `Balance due ${formatCurrency(summary.balanceDue)}`
              : summary.balanceDue < 0
                ? `Refund due ${formatCurrency(-summary.balanceDue)}`
                : "Fully paid"}
          </span>
        ) : (
          <Skeleton className="inline-block h-3 w-20 align-middle" />
        )}
      </div>
      {b.notes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-gold-tint px-2 py-1.5 text-xs text-ink-soft">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-gold-dark" />
          {b.notes}
        </p>
      )}
    </Row>
  );
}
