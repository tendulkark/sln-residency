import { createBookingSchema, updateBookingSchema, updateBookingStatusSchema, bookingChargeSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";
import { findBookingConflict, findClosureConflict } from "#src/lib/availability.js";
import { priceRoom } from "#src/lib/tax.js";
import { BOOKING_INCLUDE, nightsBetween, computeStayBreakdown, createReservedInvoice, isBookingLocked } from "#src/lib/billing.js";

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
          // Not date-bounded: a checked-in guest who overstays their
          // scheduled checkOut must stay "active" until someone actually
          // checks them out, or staff would lose the ability to find that
          // booking (and check it out) the moment the clock passes checkOut.
          ...(activeOnly === "true" ? { status: { isTerminal: false } } : {}),
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

  // Batch grand-total/paid/balance figures for a set of bookings — powers
  // the Reservations month view's day-detail popover, which lists every
  // booking touching a day and needs each one's balance without opening
  // Manage Stay individually. Reuses computeStayBreakdown (the same
  // billing.js function Manage Stay and invoice generation use) so the
  // figures can never drift from what those screens show; a group
  // booking's sibling rooms share one stay, so they're computed once and
  // fanned back out to every id in the request that belongs to that group.
  fastify.get(
    "/bookings/stay-summaries",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request) => {
      const ids = String(request.query.ids ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const tenantId = request.user.tenantId;
      const idSet = new Set(ids);
      const results = {};

      for (const id of ids) {
        if (results[id]) continue;
        // eslint-disable-next-line no-await-in-loop
        const stay = await computeStayBreakdown(fastify.prisma, tenantId, id);
        if (!stay) continue;
        const summary = { grandTotal: stay.summary.grandTotal, advancePaid: stay.summary.advancePaid, balanceDue: stay.summary.balanceDue };
        for (const b of stay.bookings) {
          if (idSet.has(b.id)) results[b.id] = summary;
        }
      }

      return results;
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
        resolvedPayments.push({ amount: payment.amount, methodId: method.id, statusId: status.id, paidAt: payment.paidAt });
      }

      const occupiedRoomStatus = checkInImmediately ? await fastify.prisma.status.findFirst({ where: { tenantId, domain: "room", code: "occupied" } }) : null;

      const groupCode = roomIds ? generateGroupCode() : null;
      const nights = nightsBetween(checkIn, checkOut);
      const now = new Date();

      // Reserving the invoice number inside this transaction means a P2002
      // on the tenantId+invoiceNumber race (two staff creating bookings at
      // the same instant, both computing the same "next" number) rolls back
      // the whole thing — bookings included. Retry the entire transaction
      // once in that specific case; anything else (a real conflict, a bad
      // input) still fails immediately.
      let createdBookings, createdCharges, invoice;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await fastify.prisma.$transaction(async (tx) => {
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
                  ...(payment.paidAt ? { recordedAt: payment.paidAt } : {}),
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

            // One reserved invoice per stay — tied to the group's primary
            // booking (created[0]), same convention computeStayBreakdown and
            // every other invoice route already use for a group booking.
            // Computed inside this same transaction so it picks up whatever
            // charges/discount/advance payment were entered right on the
            // booking form, not just the bare room rate.
            const stayForInvoice = await computeStayBreakdown(tx, tenantId, created[0].id);
            const invoice = await createReservedInvoice(tx, {
              tenantId,
              bookingId: created[0].id,
              generatedById: request.user.id,
              stay: stayForInvoice,
            });

            return { createdBookings: created, createdCharges, invoice };
          });
          ({ createdBookings, createdCharges, invoice } = result);
          break;
        } catch (err) {
          const isInvoiceNumberClash = err.code === "P2002" && String(err.meta?.target ?? "").includes("invoiceNumber");
          if (!isInvoiceNumberClash || attempt === 1) throw err;
        }
      }

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "invoice.reserve",
        entityType: "Invoice",
        entityId: invoice.id,
        metadata: { bookingId: createdBookings[0].id, invoiceNumber: invoice.invoiceNumber, groupCode },
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

      const existing = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId }, include: { status: true } });
      if (!existing) return reply.code(404).send({ error: "Booking not found" });
      if (isBookingLocked(existing.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — editing it now requires the bookings.correct permission" });
      }

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

      // A reservation's checkIn/checkOut are only an approximate arrival
      // window — the guest can walk in earlier or later than that. The
      // moment staff actually check them in, the stay's rolling-24h billing
      // clock (see billing.js nightsBetween) restarts from that real
      // timestamp: checkIn moves to now and checkOut shifts to now plus
      // however many nights were already reserved, so the room's schedule
      // (and its "late checkout" detection) reflects when the guest truly
      // arrived rather than the original estimate.
      const shiftedSchedule =
        status.code === "checked_in" && parsed.data.actualCheckIn
          ? {
              checkIn: parsed.data.actualCheckIn,
              checkOut: new Date(
                new Date(parsed.data.actualCheckIn).getTime() +
                  nightsBetween(existing.checkIn, existing.checkOut) * 24 * 60 * 60 * 1000
              ),
            }
          : {};

      const booking = await fastify.prisma.booking.update({
        where: { id: existing.id },
        data: {
          statusId: status.id,
          ...(parsed.data.actualCheckIn ? { actualCheckIn: parsed.data.actualCheckIn } : {}),
          ...(parsed.data.actualCheckOut ? { actualCheckOut: parsed.data.actualCheckOut } : {}),
          ...shiftedSchedule,
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

      // A cancelled booking's reserved invoice (its number was assigned the
      // moment it was booked — billing.js createReservedInvoice) is
      // cancelled right along with it, so a dead booking never leaves a
      // phantom "active" invoice sitting in the Invoices list. In practice
      // this only ever touches an unfinalized one — Cancel Booking is only
      // offered before check-in, well before a stay's invoice is finalized
      // at checkout — but the check is unconditional so it's still correct
      // if that ever changes.
      if (status.code === "cancelled") {
        const activeInvoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: booking.id, isCancelled: false } });
        if (activeInvoice) {
          await fastify.prisma.invoice.update({
            where: { id: activeInvoice.id },
            data: { isCancelled: true, cancelledAt: new Date(), cancelledById: request.user.id, cancellationReason: "Booking cancelled" },
          });
          await recordAudit(fastify.prisma, {
            tenantId,
            userId: request.user.id,
            action: "invoice.cancel",
            entityType: "Invoice",
            entityId: activeInvoice.id,
            metadata: { invoiceNumber: activeInvoice.invoiceNumber, reason: "Booking cancelled", bookingId: booking.id },
          });
        }
      }

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

      const booking = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId }, include: { status: true } });
      if (!booking) return reply.code(404).send({ error: "Booking not found" });
      if (isBookingLocked(booking.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — adding a charge now requires the bookings.correct permission" });
      }

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
      const existing = await fastify.prisma.bookingCharge.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
        include: { booking: { include: { status: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "Charge not found" });
      if (isBookingLocked(existing.booking.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — removing a charge now requires the bookings.correct permission" });
      }

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
