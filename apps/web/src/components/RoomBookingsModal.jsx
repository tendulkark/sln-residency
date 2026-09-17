import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Users } from "lucide-react";
import { apiFetch } from "../lib/api.js";
import { formatCurrency, formatDateTime } from "../lib/format.js";
import { useAuthStore } from "../store/authStore.js";
import { Badge, Button, EmptyState } from "../ui/index.js";
import Modal from "./Modal.jsx";
import BookingFormModal from "./BookingFormModal.jsx";
import EditBookingModal from "./EditBookingModal.jsx";
import ManageStayModal from "./ManageStayModal.jsx";

export default function RoomBookingsModal({ room, onClose }) {
  const permissions = useAuthStore((s) => s.permissions);
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["bookings", "room", room.id],
    queryFn: () => apiFetch(`/bookings?roomId=${room.id}&activeOnly=true`),
  });

  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [editBooking, setEditBooking] = useState(null);
  const [manageBookingId, setManageBookingId] = useState(null);

  return (
    <>
      <Modal
        title={`Room ${room.roomNumber} — Bookings`}
        actions={
          permissions.has("bookings.create") && (
            <Button size="sm" onClick={() => setNewBookingOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Booking
            </Button>
          )
        }
        onClose={onClose}
        wide
      >
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {bookings?.length === 0 && (
          <EmptyState icon={CalendarDays} title="No bookings for this room" subtitle="Create one with New Booking above." />
        )}

        <div className="space-y-3">
          {bookings?.map((booking) => (
            <div
              key={booking.id}
              role="button"
              tabIndex={0}
              onClick={() => setManageBookingId(booking.id)}
              onKeyDown={(e) => e.key === "Enter" && setManageBookingId(booking.id)}
              className="block w-full cursor-pointer rounded-lg border border-line bg-card p-4 text-left shadow-sm transition hover:border-brand"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    {booking.guest.name}
                    <span className="flex items-center gap-0.5 text-xs font-normal text-gray-500">
                      <Users className="h-3 w-3" />
                      {booking.adults + booking.children}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatDateTime(booking.checkIn)} → {formatDateTime(booking.checkOut)} · {formatCurrency(booking.totalAmount)}
                  </p>
                  {booking.groupCode && (
                    <p className="mt-1">
                      <Badge tone="neutral">Group booking · {booking.groupCode}</Badge>
                    </p>
                  )}
                  {booking.notes && <p className="mt-1 text-xs text-gray-500">Notes: {booking.notes}</p>}
                  {booking.status.code !== "checked_in" && !booking.status.isTerminal && (
                    <p className="mt-1 text-xs text-gray-400">Not checked in yet — tap to check in.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {permissions.has("bookings.edit") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditBooking(booking);
                      }}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-muted-strong hover:text-gray-700"
                      aria-label="Edit booking"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <Badge color={booking.status.color}>{booking.status.code === "confirmed" || booking.status.code === "pending" ? "Arriving" : booking.status.label}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {newBookingOpen && <BookingFormModal defaultRoomId={room.id} onClose={() => setNewBookingOpen(false)} />}
      {editBooking && <EditBookingModal booking={editBooking} onClose={() => setEditBooking(null)} />}
      {manageBookingId && <ManageStayModal bookingId={manageBookingId} onClose={() => setManageBookingId(null)} />}
    </>
  );
}
