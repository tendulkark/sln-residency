import { AlertTriangle, Users } from "lucide-react";
import { formatCurrency, formatTime } from "@/lib/format.js";
import { SYNTHETIC_BUCKET_COLOR } from "@/modules/dashboard/constants.js";

export default function RoomBoardCard({ room, onClick }) {
  const color = SYNTHETIC_BUCKET_COLOR[room.bucket] ?? room.roomStatus.color;
  const bucketLabel = room.bucket.replace("_", " ");

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-lg border-2 p-4 text-left shadow-sm transition hover:shadow-md"
      style={{ backgroundColor: `${color}24`, borderColor: `${color}70` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-gray-900">{room.roomNumber}</p>
          <p className="text-xs uppercase tracking-wide text-gray-500">{room.roomType.name}</p>
        </div>
        <span className="text-xs font-semibold" style={{ color }}>
          {formatCurrency(room.pricePerNight)}/night
        </span>
      </div>

      {room.guest ? (
        <div className="mt-3 text-xs text-gray-600">
          <p className="flex items-center gap-1 font-medium text-gray-900">
            {room.guest.name}
            {room.guest.statusCode === "checked_in" && (
              <span className="inline-flex items-center gap-0.5 text-gray-500">
                <Users className="h-3 w-3" />
                {room.guest.guests}
              </span>
            )}
          </p>
          <p className={room.guest.isOverdue ? "font-semibold text-red-600" : undefined}>
            {room.guest.statusCode === "checked_in"
              ? `Checked in · out ${new Date(room.guest.checkOut).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
              : `${formatTime(room.guest.checkIn)} · ${room.guest.statusLabel}`}
            {room.guest.isOverdue && " · Late checkout"}
          </p>
        </div>
      ) : room.closure ? (
        <p className="mt-3 text-xs text-gray-600">{room.closure.reason || "Blocked"}</p>
      ) : (
        <div className="mt-3 h-8" />
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {room.bucket === "overdue" && (
          <span className="flex items-center gap-1 rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        )}
        {room.inHouseCount > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: `${color}22`, color }}>
            In-house {room.inHouseCount}
          </span>
        )}
        {room.reservedCount > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
            style={{ backgroundColor: `${SYNTHETIC_BUCKET_COLOR.reserved}22`, color: SYNTHETIC_BUCKET_COLOR.reserved }}
          >
            Reserved {room.reservedCount}
          </span>
        )}
        {room.upcomingCount > 0 && (
          <span className="rounded-full bg-muted-strong px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
            {room.upcomingCount} upcoming
          </span>
        )}
        {room.inHouseCount === 0 && room.reservedCount === 0 && !room.closure && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: `${color}22`, color }}>
            {bucketLabel}
          </span>
        )}
      </div>
    </button>
  );
}
