import { createBookingSchema, updateBookingSchema, updateBookingStatusSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { findBookingConflict, findClosureConflict } from "../lib/availability.js";

const BOOKING_INCLUDE = {
  room: { select: { id: true, roomNumber: true, floor: true } },
  guest: { select: { id: true, name: true, phone: true, email: true } },
  status: { select: { id: true, code: true, label: true, color: true, isTerminal: true } },
};

function nightsBetween(checkIn, checkOut) {
  return Math.max(1, Math.ceil((checkOut - checkIn) / (24 * 60 * 60 * 1000)));
}

export default async function bookingsRoutes(fastify) {
  fastify.get(
    "/bookings",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request) => {
      const { from, to, roomId, search } = request.query;

      return fastify.prisma.booking.findMany({
        where: {
          tenantId: request.user.tenantId,
          ...(roomId ? { roomId } : {}),
          ...(from ? { checkOut: { gt: new Date(from) } } : {}),
          ...(to ? { checkIn: { lt: new Date(to) } } : {}),
          ...(search
            ? {
                OR: [
                  { guest: { name: { contains: search, mode: "insensitive" } } },
                  { room: { roomNumber: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: BOOKING_INCLUDE,
        orderBy: { checkIn: "asc" },
      });
    }
  );

  fastify.get(
    "/bookings/:id",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request, reply) => {
      const booking = await fastify.prisma.booking.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
        include: { ...BOOKING_INCLUDE, payments: { include: { method: true, status: true } } },
      });
      if (!booking) return reply.code(404).send({ error: "Booking not found" });
      return booking;
    }
  );

  fastify.post(
    "/bookings",
    { preHandler: [fastify.authenticate, requirePermission("bookings.create")] },
    async (request, reply) => {
      const parsed = createBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const { roomId, guestId, guest, checkIn, checkOut, adults, children, ratePerNight, notes } = parsed.data;
      const tenantId = request.user.tenantId;

      const room = await fastify.prisma.room.findFirst({ where: { id: roomId, tenantId } });
      if (!room) return reply.code(400).send({ error: "Unknown room" });

      const bookingConflict = await findBookingConflict(fastify.prisma, { tenantId, roomId, checkIn, checkOut });
      if (bookingConflict) {
        return reply.code(409).send({ error: "Room is already booked for part of that date range" });
      }
      const closureConflict = await findClosureConflict(fastify.prisma, {
        tenantId,
        roomId,
        startDate: checkIn,
        endDate: checkOut,
      });
      if (closureConflict) {
        return reply.code(409).send({ error: "Room is closed for part of that date range" });
      }

      let resolvedGuestId = guestId;
      if (!resolvedGuestId) {
        const existingGuest = guest.phone
          ? await fastify.prisma.guest.findFirst({ where: { tenantId, phone: guest.phone } })
          : null;
        resolvedGuestId = existingGuest
          ? existingGuest.id
          : (await fastify.prisma.guest.create({ data: { tenantId, ...guest } })).id;
      } else {
        const existing = await fastify.prisma.guest.findFirst({ where: { id: resolvedGuestId, tenantId } });
        if (!existing) return reply.code(400).send({ error: "Unknown guest" });
      }

      const defaultStatus = await fastify.prisma.status.findFirst({
        where: { tenantId, domain: "booking", isDefault: true },
      });
      if (!defaultStatus) return reply.code(500).send({ error: "No default booking status configured" });

      const totalAmount = ratePerNight * nightsBetween(checkIn, checkOut);

      const booking = await fastify.prisma.booking.create({
        data: {
          tenantId,
          roomId,
          guestId: resolvedGuestId,
          statusId: defaultStatus.id,
          checkIn,
          checkOut,
          adults,
          children,
          ratePerNight,
          totalAmount,
          notes,
          createdById: request.user.id,
        },
        include: BOOKING_INCLUDE,
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "booking.create",
        entityType: "Booking",
        entityId: booking.id,
        metadata: { roomId, checkIn, checkOut, totalAmount },
      });

      return reply.code(201).send(booking);
    }
  );

  fastify.patch(
    "/bookings/:id",
    { preHandler: [fastify.authenticate, requirePermission("bookings.edit")] },
    async (request, reply) => {
      const parsed = updateBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;

      const existing = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Booking not found" });

      const roomId = parsed.data.roomId ?? existing.roomId;
      const checkIn = parsed.data.checkIn ?? existing.checkIn;
      const checkOut = parsed.data.checkOut ?? existing.checkOut;
      const ratePerNight = parsed.data.ratePerNight ?? Number(existing.ratePerNight);

      if (parsed.data.roomId) {
        const room = await fastify.prisma.room.findFirst({ where: { id: roomId, tenantId } });
        if (!room) return reply.code(400).send({ error: "Unknown room" });
      }

      const bookingConflict = await findBookingConflict(fastify.prisma, {
        tenantId,
        roomId,
        checkIn,
        checkOut,
        excludeBookingId: existing.id,
      });
      if (bookingConflict) {
        return reply.code(409).send({ error: "Room is already booked for part of that date range" });
      }
      const closureConflict = await findClosureConflict(fastify.prisma, {
        tenantId,
        roomId,
        startDate: checkIn,
        endDate: checkOut,
      });
      if (closureConflict) {
        return reply.code(409).send({ error: "Room is closed for part of that date range" });
      }

      const totalAmount = ratePerNight * nightsBetween(checkIn, checkOut);

      const booking = await fastify.prisma.booking.update({
        where: { id: existing.id },
        data: { ...parsed.data, roomId, checkIn, checkOut, ratePerNight, totalAmount },
        include: BOOKING_INCLUDE,
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "booking.update",
        entityType: "Booking",
        entityId: booking.id,
        metadata: parsed.data,
      });

      return booking;
    }
  );

  fastify.patch(
    "/bookings/:id/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = updateBookingStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;

      const existing = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Booking not found" });

      const status = await fastify.prisma.status.findFirst({
        where: { id: parsed.data.statusId, tenantId, domain: "booking" },
      });
      if (!status) return reply.code(400).send({ error: "Unknown booking status" });

      const requiredPermission = status.code === "cancelled" ? "bookings.cancel" : "bookings.edit";
      if (!request.user.permissions.has(requiredPermission)) {
        return reply.code(403).send({ error: `Missing permission: ${requiredPermission}` });
      }

      const booking = await fastify.prisma.booking.update({
        where: { id: existing.id },
        data: {
          statusId: status.id,
          ...(parsed.data.actualCheckIn ? { actualCheckIn: parsed.data.actualCheckIn } : {}),
          ...(parsed.data.actualCheckOut ? { actualCheckOut: parsed.data.actualCheckOut } : {}),
        },
        include: BOOKING_INCLUDE,
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "booking.status_change",
        entityType: "Booking",
        entityId: booking.id,
        metadata: { statusCode: status.code },
      });

      // Check-in/check-out flips the room's own housekeeping status.
      const roomStatusCode = status.code === "checked_in" ? "occupied" : status.code === "checked_out" ? "dirty" : null;
      if (roomStatusCode) {
        const roomStatus = await fastify.prisma.status.findFirst({
          where: { tenantId, domain: "room", code: roomStatusCode },
        });
        if (roomStatus) {
          await fastify.prisma.room.update({ where: { id: booking.roomId }, data: { statusId: roomStatus.id } });
          await recordAudit(fastify.prisma, {
            tenantId,
            userId: request.user.id,
            action: "room.status_change",
            entityType: "Room",
            entityId: booking.roomId,
            metadata: { statusCode: roomStatusCode, viaBookingId: booking.id },
          });
        }
      }

      return booking;
    }
  );
}
