// Overlap checks used before creating/editing a booking or a room closure.
// "Active" bookings are anything not in a terminal status (checked_out,
// no_show, cancelled) — those free up the room.

export async function findBookingConflict(prisma, { tenantId, roomId, checkIn, checkOut, excludeBookingId }) {
  return prisma.booking.findFirst({
    where: {
      tenantId,
      roomId,
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { isTerminal: false },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    include: { guest: true, status: true },
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
