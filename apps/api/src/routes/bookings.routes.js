import { createBookingSchema, updateBookingSchema, updateBookingStatusSchema, bookingChargeSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { findBookingConflict, findClosureConflict } from "../lib/availability.js";
import { priceRoom } from "../lib/tax.js";
import { BOOKING_INCLUDE, nightsBetween, computeStayBreakdown } from "../lib/billing.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function generateGroupCode() {
  return `GRP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
}

export default async function bookingsRoutes(fastify) {
  fastify.get(
    "/bookings",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request) => {
      const { from, to, roomId, search, activeOnly } = request.query;

      return fastify.prisma.booking.findMany({
        where: {
          tenantId: request.user.tenantId,
          ...(roomId ? { roomId } : {}),
          ...(from ? { checkOut: { gt: new Date(from) } } : {}),
          ...(to ? { checkIn: { lt: new Date(to) } } : {}),
          ...(activeOnly === "true" ? { checkOut: { gte: startOfToday() } } : {}),
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

  // The full "Manage Stay" picture: this booking plus every sibling that
  // shares its groupCode (a group booking splits one guest across several
  // rooms but is billed as one stay), all ad-hoc charges/discounts, all
  // payments, and the computed billing breakdown.
  fastify.get(
    "/bookings/:id/stay",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request, reply) => {
      const stay = await computeStayBreakdown(fastify.prisma, request.user.tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });
      const { bookings, charges, payments, summary } = stay;
      return { bookings, charges, payments, summary };
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
      const {
        roomId,
        roomIds,
        guestId,
        guest,
        checkIn,
        checkOut,
        adults,
        children,
        ratePerNight,
        notes,
        advancePayments,
        discount,
        charges,
        checkInImmediately,
      } = parsed.data;
      const tenantId = request.user.tenantId;
      const targetRoomIds = roomIds ?? [roomId];

      const rooms = await fastify.prisma.room.findMany({ where: { id: { in: targetRoomIds }, tenantId }, include: { roomType: true } });
      if (rooms.length !== targetRoomIds.length) return reply.code(400).send({ error: "Unknown room" });

      for (const id of targetRoomIds) {
        const bookingConflict = await findBookingConflict(fastify.prisma, { tenantId, roomId: id, checkIn, checkOut });
        if (bookingConflict) return reply.code(409).send({ error: `Room is already booked for part of that date range` });
        const closureConflict = await findClosureConflict(fastify.prisma, { tenantId, roomId: id, startDate: checkIn, endDate: checkOut });
        if (closureConflict) return reply.code(409).send({ error: `Room is closed for part of that date range` });
      }

      let resolvedGuestId = guestId;
      if (!resolvedGuestId) {
        const existingGuest = guest.phone ? await fastify.prisma.guest.findFirst({ where: { tenantId, phone: guest.phone } }) : null;
        resolvedGuestId = existingGuest ? existingGuest.id : (await fastify.prisma.guest.create({ data: { tenantId, ...guest } })).id;
      } else {
        const existing = await fastify.prisma.guest.findFirst({ where: { id: resolvedGuestId, tenantId } });
        if (!existing) return reply.code(400).send({ error: "Unknown guest" });
      }

      const bookingStatusDomain = await fastify.prisma.status.findMany({ where: { tenantId, domain: "booking" } });
      const defaultStatus = bookingStatusDomain.find((s) => s.isDefault);
      if (!defaultStatus) return reply.code(500).send({ error: "No default booking status configured" });
      const checkedInStatus = bookingStatusDomain.find((s) => s.code === "checked_in");
      if (checkInImmediately && !checkedInStatus) return reply.code(500).send({ error: "No checked_in status configured" });
      const initialStatus = checkInImmediately ? checkedInStatus : defaultStatus;

      const resolvedPayments = [];
      for (const payment of advancePayments ?? []) {
        const method = await fastify.prisma.paymentMethod.findFirst({ where: { id: payment.methodId, tenantId, isActive: true } });
        if (!method) return reply.code(400).send({ error: "Unknown payment method" });
        const status = await fastify.prisma.status.findFirst({ where: { id: payment.statusId, tenantId, domain: "payment" } });
        if (!status) return reply.code(400).send({ error: "Unknown payment status" });
        resolvedPayments.push({ amount: payment.amount, methodId: method.id, statusId: status.id });
      }

      const occupiedRoomStatus = checkInImmediately ? await fastify.prisma.status.findFirst({ where: { tenantId, domain: "room", code: "occupied" } }) : null;

      const groupCode = roomIds ? generateGroupCode() : null;
      const nights = nightsBetween(checkIn, checkOut);
      const now = new Date();

      const { createdBookings, createdCharges } = await fastify.prisma.$transaction(async (tx) => {
        const created = [];
        for (const room of rooms) {
          const rate = roomIds ? (await priceRoom(tx, tenantId, room.roomType.basePrice)).total : ratePerNight;
          const booking = await tx.booking.create({
            data: {
              tenantId,
              roomId: room.id,
              guestId: resolvedGuestId,
              statusId: initialStatus.id,
              groupCode,
              checkIn,
              checkOut,
              adults,
              children,
              ratePerNight: rate,
              totalAmount: rate * nights,
              notes,
              createdById: request.user.id,
              ...(checkInImmediately ? { actualCheckIn: now } : {}),
            },
            include: BOOKING_INCLUDE,
          });
          created.push(booking);
          if (occupiedRoomStatus) {
            await tx.room.update({ where: { id: room.id }, data: { statusId: occupiedRoomStatus.id } });
          }
        }

        for (const payment of resolvedPayments) {
          await tx.payment.create({
            data: {
              tenantId,
              bookingId: created[0].id,
              methodId: payment.methodId,
              statusId: payment.statusId,
              amount: payment.amount,
              referenceNote: groupCode ? `Advance for group ${groupCode}` : undefined,
              recordedById: request.user.id,
            },
          });
        }

        const createdCharges = [];
        if (discount) {
          createdCharges.push(
            await tx.bookingCharge.create({
              data: {
                tenantId,
                bookingId: created[0].id,
                type: "discount",
                description: discount.description || "Discount",
                amount: discount.amount,
                createdById: request.user.id,
              },
            })
          );
        }
        for (const item of charges ?? []) {
          createdCharges.push(
            await tx.bookingCharge.create({
              data: {
                tenantId,
                bookingId: created[0].id,
                type: "charge",
                description: item.description,
                amount: item.amount,
                taxRatePercent: item.taxRatePercent ?? null,
                createdById: request.user.id,
              },
            })
          );
        }

        return { createdBookings: created, createdCharges };
      });

      for (const booking of createdBookings) {
        await recordAudit(fastify.prisma, {
          tenantId,
          userId: request.user.id,
          action: "booking.create",
          entityType: "Booking",
          entityId: booking.id,
          metadata: { roomId: booking.roomId, checkIn, checkOut, totalAmount: booking.totalAmount, groupCode, checkInImmediately: Boolean(checkInImmediately) },
        });
      }
      for (const payment of resolvedPayments) {
        await recordAudit(fastify.prisma, {
          tenantId,
          userId: request.user.id,
          action: "payment.record",
          entityType: "Payment",
          entityId: createdBookings[0].id,
          metadata: { amount: payment.amount, atBookingCreation: true },
        });
      }
      for (const charge of createdCharges) {
        await recordAudit(fastify.prisma, {
          tenantId,
          userId: request.user.id,
          action: charge.type === "discount" ? "bookingcharge.discount" : "bookingcharge.create",
          entityType: "BookingCharge",
          entityId: charge.id,
          metadata: { atBookingCreation: true },
        });
      }

      return reply.code(201).send(groupCode ? { groupCode, bookings: createdBookings } : createdBookings[0]);
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

  fastify.post(
    "/bookings/:id/charges",
    { preHandler: [fastify.authenticate, requirePermission("bookings.edit")] },
    async (request, reply) => {
      const parsed = bookingChargeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;

      const booking = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId } });
      if (!booking) return reply.code(404).send({ error: "Booking not found" });

      const charge = await fastify.prisma.bookingCharge.create({
        data: { tenantId, bookingId: booking.id, createdById: request.user.id, ...parsed.data },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: parsed.data.type === "discount" ? "bookingcharge.discount" : "bookingcharge.create",
        entityType: "BookingCharge",
        entityId: charge.id,
        metadata: parsed.data,
      });

      return reply.code(201).send(charge);
    }
  );

  fastify.delete(
    "/booking-charges/:id",
    { preHandler: [fastify.authenticate, requirePermission("bookings.edit")] },
    async (request, reply) => {
      const existing = await fastify.prisma.bookingCharge.findFirst({ where: { id: request.params.id, tenantId: request.user.tenantId } });
      if (!existing) return reply.code(404).send({ error: "Charge not found" });

      await fastify.prisma.bookingCharge.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "bookingcharge.delete",
        entityType: "BookingCharge",
        entityId: existing.id,
      });

      return reply.code(204).send();
    }
  );
}
