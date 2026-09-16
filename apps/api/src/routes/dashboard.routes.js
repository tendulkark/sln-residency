import { requirePermission } from "../lib/permissions.js";

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
          fastify.prisma.booking.findMany({ where: activeBookingWhere(dayStart, dayEnd), select: { totalAmount: true, roomId: true } }),
          fastify.prisma.booking.findMany({ where: activeBookingWhere(prevDayStart, dayStart), select: { totalAmount: true } }),
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
            where: { tenantId, recordedAt: { gte: dayStart, lt: dayEnd } },
            include: { method: true },
          }),
        ]);

      const roomsOccupiedTonight = new Set(tonightBookings.map((b) => b.roomId)).size;
      const tonightsRevenue = tonightBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
      const prevNightRevenue = prevNightBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
      const revenueChangePercent = prevNightRevenue > 0 ? Math.round(((tonightsRevenue - prevNightRevenue) / prevNightRevenue) * 100) : null;

      const paymentsByMethod = new Map();
      let paymentsTotal = 0;
      for (const payment of todayPayments) {
        paymentsTotal += Number(payment.amount);
        const key = payment.method.name;
        paymentsByMethod.set(key, (paymentsByMethod.get(key) ?? 0) + Number(payment.amount));
      }

      return {
        date: localDateLabel(dayStart),
        roomsOpenTonight: { available: totalRooms - roomsOccupiedTonight, total: totalRooms },
        tonightsRevenue,
        revenueChangePercent,
        needsAttention: { overdue: overdueArrivals, checkOuts: dueCheckouts, dirty: dirtyRoomsCount },
        roomPaymentsToday: {
          total: paymentsTotal,
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
      const { date, floor, status, search } = request.query;
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

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
          where: { tenantId, roomId: { in: roomIds }, startDate: { lt: dayEnd }, endDate: { gt: dayStart } },
        }),
        fastify.prisma.booking.findMany({
          where: {
            tenantId,
            roomId: { in: roomIds },
            status: { isTerminal: false },
            checkIn: { lt: dayEnd },
            checkOut: { gt: dayStart },
          },
          include: { guest: true, status: true },
        }),
        fastify.prisma.booking.findMany({
          where: { tenantId, roomId: { in: roomIds }, status: { isTerminal: false }, checkIn: { gte: dayEnd } },
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

        let bucket = room.status.code;
        if (closure) bucket = "closed";
        else if (inHouse.length > 0) bucket = "occupied";
        else if (reserved.length > 0) bucket = "reserved";

        const primaryBooking = inHouse[0] ?? reserved[0] ?? null;

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
              }
            : null,
        };
      });

      return status ? board.filter((r) => r.bucket === status) : board;
    }
  );
}
