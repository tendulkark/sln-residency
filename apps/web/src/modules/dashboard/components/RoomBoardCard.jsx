import { AlertTriangle, Users } from "lucide-react";
import { formatCurrency, formatTime } from "@/lib/format.js";
import { SYNTHETIC_BUCKET_COLOR } from "@/modules/dashboard/constants.js";

export default function RoomBoardCard({ room, onClick }) {
  const color = SYNTHETIC_BUCKET_COLOR[room.bucket] ?? room.roomStatus.color;
  const bucketLabel = room.bucket.replace("_", " ");

  // The status color is mixed over *white*, not laid over the cream page
  // as a translucent wash — an alpha tint of, say, the seeded "occupied"
  // red sitting on #f2e8d1 shifts toward orange, so two different Status
  // colors could end up looking alike on the board. Mixing toward white
  // keeps each hue true, and the solid left rail carries the full-strength
  // color so a row of cards still scans by color at a glance.
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col overflow-hidden rounded-lg border p-4 pl-5 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, white)`, borderColor: `color-mix(in srgb, ${color} 45%, white)` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-ink">{room.roomNumber}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{room.roomType.name}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color }}>
          {formatCurrency(room.pricePerNight)}/night
        </span>
      </div>

      {room.guest ? (
        <div className="mt-3 text-xs text-ink-soft">
          <p className="flex items-center gap-1 font-medium text-ink">
            {room.guest.name}
            {room.guest.statusCode === "checked_in" && (
              <span className="inline-flex items-center gap-0.5 text-ink-muted">
                <Users className="h-3 w-3" />
                {room.guest.guests}
              </span>
            )}
          </p>
          <p className={room.guest.isOverdue ? "font-semibold text-danger" : undefined}>
            {room.guest.statusCode === "checked_in"
              ? `Checked in · out ${new Date(room.guest.checkOut).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
              : `${formatTime(room.guest.checkIn)} · ${room.guest.statusLabel}`}
            {room.guest.isOverdue && " · Late checkout"}
          </p>
        </div>
      ) : room.closure ? (
        <p className="mt-3 text-xs text-ink-soft">{room.closure.reason || "Blocked"}</p>
      ) : (
        <div className="mt-3 h-8" />
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {room.bucket === "overdue" && (
          <span className="flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        )}
        {room.inHouseCount > 0 && (
          <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ borderColor: `color-mix(in srgb, ${color} 45%, white)`, color }}>
            In-house {room.inHouseCount}
          </span>
        )}
        {room.reservedCount > 0 && (
          <span
            className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ borderColor: `color-mix(in srgb, ${SYNTHETIC_BUCKET_COLOR.reserved} 45%, white)`, color: SYNTHETIC_BUCKET_COLOR.reserved }}
          >
            Reserved {room.reservedCount}
          </span>
        )}
        {room.upcomingCount > 0 && (
          <span className="rounded-full border border-line-strong bg-card px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-soft">
            {room.upcomingCount} upcoming
          </span>
        )}
        {room.inHouseCount === 0 && room.reservedCount === 0 && !room.closure && (
          <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ borderColor: `color-mix(in srgb, ${color} 45%, white)`, color }}>
            {bucketLabel}
          </span>
        )}
      </div>
    </button>
  );
}
