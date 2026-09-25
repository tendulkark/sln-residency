import { requirePermission } from "#src/lib/permissions.js";

function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Local-calendar-date label — never derive this from toISOString(), which
// renders in UTC and silently shifts the label back a day for any positive
// UTC offset (e.g. IST).
function localDateLabel(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfDay(dateStr) {
  const d = startOfDay(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

// The exact moment to check room availability against — defaults to
// midnight when no time is given, otherwise that date at the given
// HH:mm. Bookings now carry exact check-in/check-out timestamps (rolling
// 24h billing), so "is this room free" is a point-in-time question, not
// just a same-calendar-day one — a room checked out at 6am and re-let at
// 8pm the same day is free in between, not occupied all day.
function resolveAsOf(dateStr, timeStr) {
  const asOf = startOfDay(dateStr);
  if (typeof timeStr === "string" && /^\d{2}:\d{2}$/.test(timeStr)) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    asOf.setHours(hours, minutes, 0, 0);
  }
  return asOf;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function dashboardRoutes(fastify) {
  fastify.get(
    "/dashboard/summary",
    { preHandler: [fastify.authenticate, requirePermission("rooms.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { date } = request.query;
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const prevDayStart = addDays(dayStart, -1);

      const totalRooms = await fastify.prisma.room.count({ where: { tenantId } });

      const activeBookingWhere = (start, end) => ({
        tenantId,
        status: { isTerminal: false },
        checkIn: { lt: end },
        checkOut: { gt: start },
      });

      const [tonightBookings, prevNightBookings, dirtyRoomsCount, overdueArrivals, dueCheckouts, todayPayments] =
        await Promise.all([
          fastify.prisma.booking.findMany({ where: activeBookingWhere(dayStart, dayEnd), select: { ratePerNight: true, roomId: true } }),
          fastify.prisma.booking.findMany({ where: activeBookingWhere(prevDayStart, dayStart), select: { ratePerNight: true } }),
          fastify.prisma.room.count({ where: { tenantId, status: { code: "dirty" } } }),
          fastify.prisma.booking.count({
            where: {
              tenantId,
              status: { isTerminal: false, code: { not: "checked_in" } },
              checkIn: { lt: dayStart },
            },
          }),
          fastify.prisma.booking.count({
            where: { tenantId, status: { code: "checked_in" }, checkOut: { lt: dayEnd } },
          }),
          fastify.prisma.payment.findMany({
            where: { tenantId, recordedAt: { gte: dayStart, lt: dayEnd }, status: { code: { notIn: ["failed", "refunded"] } } },
            include: { method: true },
          }),
        ]);

      const roomsOccupiedTonight = new Set(tonightBookings.map((b) => b.roomId)).size;
      // One night's tariff per occupied room — not each booking's whole-stay
      // total, which would count a 3-night stay three times over tonight.
      const tonightsRevenue = tonightBookings.reduce((sum, b) => sum + Number(b.ratePerNight), 0);
      const prevNightRevenue = prevNightBookings.reduce((sum, b) => sum + Number(b.ratePerNight), 0);
      const revenueChangePercent = prevNightRevenue > 0 ? Math.round(((tonightsRevenue - prevNightRevenue) / prevNightRevenue) * 100) : null;

      // Net of refunds paid out today, per method.
      const paymentsByMethod = new Map();
      let paymentsTotal = 0;
      let refundsTotal = 0;
      for (const payment of todayPayments) {
        const signed = payment.type === "refund" ? -Number(payment.amount) : Number(payment.amount);
        if (payment.type === "refund") refundsTotal += Number(payment.amount);
        paymentsTotal += signed;
        const key = payment.method.name;
        paymentsByMethod.set(key, (paymentsByMethod.get(key) ?? 0) + signed);
      }

      return {
        date: localDateLabel(dayStart),
        roomsOpenTonight: { available: totalRooms - roomsOccupiedTonight, total: totalRooms },
        tonightsRevenue,
        revenueChangePercent,
        needsAttention: { overdue: overdueArrivals, checkOuts: dueCheckouts, dirty: dirtyRoomsCount },
        roomPaymentsToday: {
          total: paymentsTotal,
          refunds: refundsTotal,
          byMethod: [...paymentsByMethod.entries()].map(([name, amount]) => ({ name, amount })),
        },
      };
    }
  );

  fastify.get(
    "/dashboard/room-board",
    { preHandler: [fastify.authenticate, requirePermission("rooms.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { date, time, floor, status, search } = request.query;
      const asOf = resolveAsOf(date, time);

      const rooms = await fastify.prisma.room.findMany({
        where: {
          tenantId,
          ...(floor ? { floor } : {}),
          ...(search
            ? {
                OR: [
                  { roomNumber: { contains: search, mode: "insensitive" } },
                  { roomType: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: { roomType: true, status: true },
        orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      });

      const roomIds = rooms.map((r) => r.id);

      const [closures, coveringBookings, upcomingBookings] = await Promise.all([
        fastify.prisma.roomClosure.findMany({
          where: { tenantId, roomId: { in: roomIds }, startDate: { lte: asOf }, endDate: { gt: asOf } },
        }),
        fastify.prisma.booking.findMany({
          where: {
            tenantId,
            roomId: { in: roomIds },
            status: { isTerminal: false },
            // A checked-in guest occupies the room the instant they check
            // in (checkIn moves to that real timestamp — see the rolling
            // 24h check-in shift in bookings.routes.js) and keeps occupying
            // it past their scheduled checkout until an actual checkout is
            // recorded, so a checked-in booking always covers "asOf"
            // regardless of where checkIn/checkOut fall relative to it —
            // otherwise a guest who just checked in (checkIn barely before
            // "now") or one overstaying past checkOut would silently vanish
            // from the board. A reservation that hasn't been checked in yet
            // stays strictly bounded to its window.
            OR: [{ status: { code: "checked_in" } }, { checkIn: { lte: asOf }, checkOut: { gt: asOf } }],
          },
          include: { guest: true, status: true },
        }),
        fastify.prisma.booking.findMany({
          where: { tenantId, roomId: { in: roomIds }, status: { isTerminal: false }, checkIn: { gt: asOf } },
          select: { roomId: true },
        }),
      ]);

      const closuresByRoom = new Map();
      for (const c of closures) closuresByRoom.set(c.roomId, c);

      const bookingsByRoom = new Map();
      for (const b of coveringBookings) {
        if (!bookingsByRoom.has(b.roomId)) bookingsByRoom.set(b.roomId, []);
        bookingsByRoom.get(b.roomId).push(b);
      }

      const upcomingCountByRoom = new Map();
      for (const b of upcomingBookings) {
        upcomingCountByRoom.set(b.roomId, (upcomingCountByRoom.get(b.roomId) ?? 0) + 1);
      }

      const board = rooms.map((room) => {
        const closure = closuresByRoom.get(room.id);
        const bookings = bookingsByRoom.get(room.id) ?? [];
        const inHouse = bookings.filter((b) => b.status.code === "checked_in");
        const reserved = bookings.filter((b) => b.status.code !== "checked_in");
        const upcomingCount = upcomingCountByRoom.get(room.id) ?? 0;
        // Checked in, past their scheduled checkout, not checked out yet —
        // surfaced as its own bucket (distinct from a plain "occupied" room
        // still within its stay) so staff can spot and clear it fast.
        const overdueBooking = inHouse.find((b) => b.checkOut <= asOf);

        let bucket = room.status.code;
        if (closure) bucket = "closed";
        else if (overdueBooking) bucket = "overdue";
        else if (inHouse.length > 0) bucket = "occupied";
        else if (reserved.length > 0) bucket = "reserved";

        const primaryBooking = overdueBooking ?? inHouse[0] ?? reserved[0] ?? null;

        return {
          id: room.id,
          roomNumber: room.roomNumber,
          floor: room.floor,
          roomType: { id: room.roomType.id, name: room.roomType.name },
          pricePerNight: Number(room.roomType.basePrice),
          bucket,
          roomStatus: { id: room.status.id, code: room.status.code, label: room.status.label, color: room.status.color },
          inHouseCount: inHouse.length,
          reservedCount: reserved.length,
          upcomingCount,
          closure: closure ? { id: closure.id, startDate: closure.startDate, endDate: closure.endDate, reason: closure.reason } : null,
          guest: primaryBooking
            ? {
                bookingId: primaryBooking.id,
                name: primaryBooking.guest.name,
                guests: primaryBooking.adults + primaryBooking.children,
                checkIn: primaryBooking.checkIn,
                checkOut: primaryBooking.checkOut,
                statusCode: primaryBooking.status.code,
                statusLabel: primaryBooking.status.label,
                isOverdue: bucket === "overdue",
              }
            : null,
        };
      });

      return status ? board.filter((r) => r.bucket === status) : board;
    }
  );
}
