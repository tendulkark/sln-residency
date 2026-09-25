// Overlap checks used before creating/editing a booking or a room closure.
// "Active" bookings are anything not in a terminal status (checked_out,
// no_show, cancelled) — those free up the room.

// A checked-in guest holds the room until someone actually checks them out,
// not until their scheduled checkOut — an overdue guest is still sitting in
// it. So for a stay starting before "now", any checked-in booking that began
// before the new stay ends counts as a conflict even if its checkOut has
// already passed; a stay starting later is judged on the scheduled dates as
// usual (the overdue guest is expected to be gone by then).
export async function findBookingConflict(prisma, { tenantId, roomId, checkIn, checkOut, excludeBookingId }) {
  const startsBeforeNow = new Date(checkIn) < new Date();
  return prisma.booking.findFirst({
    where: {
      tenantId,
      roomId,
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { isTerminal: false },
      checkIn: { lt: checkOut },
      OR: [{ checkOut: { gt: checkIn } }, ...(startsBeforeNow ? [{ status: { code: "checked_in" } }] : [])],
    },
    include: { guest: true, status: true },
  });
}

// Someone else currently checked in to this room (overdue or not) — a
// second guest can never be checked in on top of them.
export async function findCurrentOccupant(prisma, { tenantId, roomId, excludeBookingIds = [] }) {
  return prisma.booking.findFirst({
    where: { tenantId, roomId, id: { notIn: excludeBookingIds }, status: { code: "checked_in" } },
    include: { guest: true },
  });
}

export async function findClosureConflict(prisma, { tenantId, roomId, startDate, endDate, excludeClosureId }) {
  return prisma.roomClosure.findFirst({
    where: {
      tenantId,
      roomId,
      ...(excludeClosureId ? { id: { not: excludeClosureId } } : {}),
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
  });
}
