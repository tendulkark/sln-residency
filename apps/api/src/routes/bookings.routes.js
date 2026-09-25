import {
  createBookingSchema,
  updateBookingSchema,
  updateBookingStatusSchema,
  bookingChargeSchema,
  checkoutSchema,
  cancelStaySchema,
} from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";
import { findBookingConflict, findClosureConflict, findCurrentOccupant } from "#src/lib/availability.js";
import { priceRoom } from "#src/lib/tax.js";
import {
  BOOKING_INCLUDE,
  nightsBetween,
  computeStayBreakdown,
  createReservedInvoice,
  isBookingLocked,
  isVoidStatus,
  refreshReservedInvoice,
  invoiceFiguresFrom,
  invoiceSnapshotFrom,
  guestSnapshotFrom,
  nextInvoiceNumber,
} from "#src/lib/billing.js";

function generateGroupCode() {
  return `GRP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
}

const HOUR_MS = 60 * 60 * 1000;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function rupees(value) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWhen(date) {
  return new Date(date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Thrown inside a $transaction to abort it with a specific HTTP answer —
// everything the transaction wrote so far is rolled back.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sendHttpError(reply, err) {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...err.extra });
  throw err;
}

async function bookingStatusByCode(prisma, tenantId, code) {
  return prisma.status.findFirst({ where: { tenantId, domain: "booking", code } });
}

// Everything that must hold before a guest can be checked in to a room at
// `at`: nobody else is still checked in there (an overdue guest counts),
// and the stay — whose billing clock restarts at the real arrival time, so
// it moves as a whole — doesn't run into another booking or a closure.
async function assertCanCheckIn(prisma, tenantId, booking, at, groupIds) {
  const occupant = await findCurrentOccupant(prisma, { tenantId, roomId: booking.roomId, excludeBookingIds: groupIds });
  if (occupant) {
    throw new HttpError(409, `Room ${booking.room.roomNumber} is still occupied by ${occupant.guest.name} — check them out first.`);
  }
  const checkIn = new Date(at);
  const checkOut = new Date(checkIn.getTime() + nightsBetween(booking.checkIn, booking.checkOut) * 24 * HOUR_MS);
  const clash = await findBookingConflict(prisma, { tenantId, roomId: booking.roomId, checkIn, checkOut, excludeBookingId: booking.id });
  if (clash && !groupIds.includes(clash.id)) {
    throw new HttpError(
      409,
      `Checking in now moves Room ${booking.room.roomNumber}'s checkout to ${formatWhen(checkOut)}, but ${clash.guest.name} is booked into it from ${formatWhen(clash.checkIn)}. Move one of the two bookings to another room first.`
    );
  }
  const closure = await findClosureConflict(prisma, { tenantId, roomId: booking.roomId, startDate: checkIn, endDate: checkOut });
  if (closure) throw new HttpError(409, `Room ${booking.room.roomNumber} is closed for part of that stay.`);
  return { checkIn, checkOut };
}

// The bill for a checked-in stay if it were closed right now, both ways:
// as booked, and re-billed on the actual stay (rolling 24h blocks from the
// real check-in to now). Mirrors computeStayBreakdown's totals exactly.
function checkoutOptions(stay, at) {
  const billable = stay.bookings.filter((b) => !isVoidStatus(b.status));
  const { chargesTotal, discountEntered, advancePaid } = stay.summary;
  const option = (nightsFor) => {
    const rooms = round2(billable.reduce((sum, b) => sum + Number(b.ratePerNight) * nightsFor(b), 0));
    const grandTotal = round2(rooms + chargesTotal - Math.min(discountEntered, rooms));
    return { nights: nightsFor(billable[0]), grandTotal, balanceDue: round2(grandTotal - advancePaid) };
  };
  const booked = option((b) => nightsBetween(b.checkIn, b.checkOut));
  const actual = option((b) => nightsBetween(b.checkIn, at));
  const scheduledCheckOut = new Date(billable[0].checkOut);
  return {
    at,
    scheduledCheckOut,
    differs: booked.nights !== actual.nights,
    direction: at > scheduledCheckOut ? "overstay" : "early",
    minutesFromSchedule: Math.round((at.getTime() - scheduledCheckOut.getTime()) / 60000),
    advancePaid,
    booked,
    actual,
  };
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

      if (checkInImmediately) {
        for (const room of rooms) {
          const occupant = await findCurrentOccupant(fastify.prisma, { tenantId, roomId: room.id });
          if (occupant) {
            return reply.code(409).send({ error: `Room ${room.roomNumber} is still occupied by ${occupant.guest.name} — check them out first.` });
          }
        }
      }

      for (const id of targetRoomIds) {
        const bookingConflict = await findBookingConflict(fastify.prisma, { tenantId, roomId: id, checkIn, checkOut });
        if (bookingConflict) {
          const roomNumber = rooms.find((r) => r.id === id).roomNumber;
          const why = bookingConflict.status.code === "checked_in" && bookingConflict.checkOut < new Date() ? "still occupied by" : "already booked by";
          return reply.code(409).send({ error: `Room ${roomNumber} is ${why} ${bookingConflict.guest.name} for part of that time` });
        }
        const closureConflict = await findClosureConflict(fastify.prisma, { tenantId, roomId: id, startDate: checkIn, endDate: checkOut });
        if (closureConflict) return reply.code(409).send({ error: `Room is closed for part of that date range` });
      }

      // The bill as it will stand the moment this booking exists — a
      // discount can't exceed the room charges it's a concession on, and an
      // advance can't exceed the bill (anything more would just be money to
      // hand straight back).
      const nightsAtBooking = nightsBetween(checkIn, checkOut);
      let roomsAtBooking = 0;
      for (const room of rooms) {
        const rate = roomIds ? (await priceRoom(fastify.prisma, tenantId, room.roomType.basePrice)).total : ratePerNight;
        roomsAtBooking += rate * nightsAtBooking;
      }
      roomsAtBooking = round2(roomsAtBooking);
      if (discount && discount.amount > roomsAtBooking) {
        return reply.code(400).send({ error: `Discount (${rupees(discount.amount)}) can't be more than the room charges (${rupees(roomsAtBooking)}).` });
      }
      const billAtBooking = round2(roomsAtBooking + (charges ?? []).reduce((sum, c) => sum + c.amount, 0) - (discount?.amount ?? 0));
      const advanceTotal = round2((advancePayments ?? []).reduce((sum, p) => sum + p.amount, 0));
      if (advanceTotal > billAtBooking) {
        return reply.code(400).send({ error: `Advance (${rupees(advanceTotal)}) is more than the bill (${rupees(billAtBooking)}).` });
      }

      let resolvedGuestId = guestId;
      if (!resolvedGuestId) {
        // Reuse a guest only when both the phone AND the name match — family
        // members and colleagues often share one number, and silently
        // filing a new guest under someone else's name puts the wrong name
        // on the invoice.
        const existingGuest = guest.phone
          ? await fastify.prisma.guest.findFirst({ where: { tenantId, phone: guest.phone, name: { equals: guest.name.trim(), mode: "insensitive" } } })
          : null;
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
      if (isVoidStatus(existing.status)) {
        return reply.code(409).send({ error: `This booking is ${existing.status.label.toLowerCase()} — it can't be edited` });
      }
      if (isBookingLocked(existing.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — editing it now requires the bookings.correct permission" });
      }

      const checkIn = parsed.data.checkIn ?? existing.checkIn;
      const checkOut = parsed.data.checkOut ?? existing.checkOut;
      if (checkOut <= checkIn) return reply.code(400).send({ error: "Check-out must be after check-in" });
      const datesChanged = Boolean(parsed.data.checkIn || parsed.data.checkOut);

      if (parsed.data.roomId) {
        const room = await fastify.prisma.room.findFirst({ where: { id: parsed.data.roomId, tenantId } });
        if (!room) return reply.code(400).send({ error: "Unknown room" });
      }

      // A group booking is one stay across several rooms, so its dates move
      // together — extending or shortening just the room you happened to
      // open would leave the others (and the shared bill) out of step. Room
      // and rate stay per-room.
      const siblings = existing.groupCode && datesChanged
        ? await fastify.prisma.booking.findMany({
            where: { tenantId, groupCode: existing.groupCode, id: { not: existing.id } },
            include: { status: true, room: true },
          })
        : [];
      const movingSiblings = siblings.filter((b) => !isVoidStatus(b.status));
      const groupIds = [existing.id, ...siblings.map((b) => b.id)];

      const targets = [
        { id: existing.id, roomId: parsed.data.roomId ?? existing.roomId, rate: parsed.data.ratePerNight ?? Number(existing.ratePerNight), data: parsed.data },
        ...movingSiblings.map((b) => ({ id: b.id, roomId: b.roomId, rate: Number(b.ratePerNight), data: {} })),
      ];

      for (const t of targets) {
        const bookingConflict = await findBookingConflict(fastify.prisma, { tenantId, roomId: t.roomId, checkIn, checkOut, excludeBookingId: t.id });
        if (bookingConflict && !groupIds.includes(bookingConflict.id)) {
          return reply.code(409).send({ error: `Room is already booked for part of that date range (${bookingConflict.guest.name})` });
        }
        const closureConflict = await findClosureConflict(fastify.prisma, { tenantId, roomId: t.roomId, startDate: checkIn, endDate: checkOut });
        if (closureConflict) return reply.code(409).send({ error: "Room is closed for part of that date range" });
      }

      let booking;
      try {
        booking = await fastify.prisma.$transaction(async (tx) => {
          let updated;
          for (const t of targets) {
            const row = await tx.booking.update({
              where: { id: t.id },
              data: { ...t.data, roomId: t.roomId, checkIn, checkOut, ratePerNight: t.rate, totalAmount: round2(t.rate * nightsBetween(checkIn, checkOut)) },
              include: BOOKING_INCLUDE,
            });
            if (t.id === existing.id) updated = row;
          }
          const stay = await computeStayBreakdown(tx, tenantId, existing.id);
          if (stay.summary.discountEntered > stay.summary.roomsInclTax) {
            throw new HttpError(
              409,
              `That would bring the room charges (${rupees(stay.summary.roomsInclTax)}) below the discount already given (${rupees(stay.summary.discountEntered)}). Remove or reduce the discount first.`
            );
          }
          return updated;
        });
      } catch (err) {
        return sendHttpError(reply, err);
      }

      await refreshReservedInvoice(fastify.prisma, tenantId, existing.id);
      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "booking.update",
        entityType: "Booking",
        entityId: booking.id,
        metadata: { ...parsed.data, ...(movingSiblings.length ? { groupRoomsMoved: movingSiblings.map((b) => b.id) } : {}) },
      });

      return booking;
    }
  );

  // Low-level single-booking status change. The transitions that move money
  // or rooms have their own stay-level endpoints with their own rules —
  // check-in (POST /bookings/:id/check-in), checkout (POST /bookings/:id/
  // checkout) and cancellation (POST /bookings/:id/cancel) — so this only
  // allows what's safe on its own, and never leaves a terminal status: a
  // cancelled booking can't be revived over whoever took its room since, and
  // a checked-out stay can't be cancelled out from under its tax invoice.
  fastify.patch(
    "/bookings/:id/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = updateBookingStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;

      const existing = await fastify.prisma.booking.findFirst({ where: { id: request.params.id, tenantId }, include: { status: true, room: true } });
      if (!existing) return reply.code(404).send({ error: "Booking not found" });

      const status = await fastify.prisma.status.findFirst({
        where: { id: parsed.data.statusId, tenantId, domain: "booking" },
      });
      if (!status) return reply.code(400).send({ error: "Unknown booking status" });

      if (status.code === "checked_out") return reply.code(400).send({ error: "Use Checkout to check a guest out" });
      if (status.code === "cancelled") return reply.code(400).send({ error: "Use Cancel Booking to cancel a booking" });
      if (existing.status.isTerminal) {
        return reply.code(409).send({ error: `This booking is already ${existing.status.label.toLowerCase()} — its status can't be changed` });
      }
      if (existing.status.code === "checked_in") {
        return reply.code(409).send({ error: "This guest is checked in — the only next step is Checkout" });
      }

      const requiredPermission = status.code === "no_show" ? "bookings.cancel" : "bookings.edit";
      if (!request.user.permissions.has(requiredPermission)) {
        return reply.code(403).send({ error: `Missing permission: ${requiredPermission}` });
      }

      // A reservation's checkIn/checkOut are only an approximate arrival
      // window — the guest can walk in earlier or later than that. The
      // moment staff actually check them in, the stay's rolling-24h billing
      // clock (see billing.js nightsBetween) restarts from that real
      // timestamp: checkIn moves to now and checkOut shifts to now plus
      // however many nights were already reserved.
      let shiftedSchedule = {};
      if (status.code === "checked_in") {
        const at = parsed.data.actualCheckIn ?? new Date();
        try {
          shiftedSchedule = await assertCanCheckIn(fastify.prisma, tenantId, existing, at, [existing.id]);
        } catch (err) {
          return sendHttpError(reply, err);
        }
        parsed.data.actualCheckIn = at;
      }

      const booking = await fastify.prisma.booking.update({
        where: { id: existing.id },
        data: {
          statusId: status.id,
          ...(status.code === "checked_in" ? { actualCheckIn: parsed.data.actualCheckIn, ...shiftedSchedule } : {}),
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

      // A no-show's reserved invoice number is cancelled with it, same as a
      // cancelled booking's, so it never lingers as a phantom open invoice.
      if (status.code === "no_show") {
        const activeInvoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: booking.id, isCancelled: false, isFinalized: false } });
        if (activeInvoice) {
          await fastify.prisma.invoice.update({
            where: { id: activeInvoice.id },
            data: { isCancelled: true, cancelledAt: new Date(), cancelledById: request.user.id, cancellationReason: "Guest did not arrive (no-show)" },
          });
        }
      }

      if (status.code === "checked_in") {
        const occupied = await fastify.prisma.status.findFirst({ where: { tenantId, domain: "room", code: "occupied" } });
        if (occupied) await fastify.prisma.room.update({ where: { id: booking.roomId }, data: { statusId: occupied.id } });
      }

      return booking;
    }
  );

  // Checks in every room of the stay (one booking, or all rooms of a group)
  // together, all-or-nothing — see assertCanCheckIn for what's verified.
  fastify.post(
    "/bookings/:id/check-in",
    { preHandler: [fastify.authenticate, requirePermission("bookings.edit")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const toCheckIn = stay.bookings.filter((b) => !b.status.isTerminal && b.status.code !== "checked_in");
      if (toCheckIn.length === 0) return reply.code(409).send({ error: "Nothing to check in — this stay is already checked in or closed" });

      const checkedIn = await bookingStatusByCode(fastify.prisma, tenantId, "checked_in");
      const occupied = await fastify.prisma.status.findFirst({ where: { tenantId, domain: "room", code: "occupied" } });
      if (!checkedIn) return reply.code(500).send({ error: "No checked_in status configured" });

      const at = new Date();
      const groupIds = stay.bookings.map((b) => b.id);
      try {
        await fastify.prisma.$transaction(async (tx) => {
          for (const b of toCheckIn) {
            const schedule = await assertCanCheckIn(tx, tenantId, b, at, groupIds);
            await tx.booking.update({ where: { id: b.id }, data: { statusId: checkedIn.id, actualCheckIn: at, ...schedule } });
            if (occupied) await tx.room.update({ where: { id: b.roomId }, data: { statusId: occupied.id } });
          }
        });
      } catch (err) {
        return sendHttpError(reply, err);
      }

      for (const b of toCheckIn) {
        await recordAudit(fastify.prisma, { tenantId, userId: request.user.id, action: "booking.status_change", entityType: "Booking", entityId: b.id, metadata: { statusCode: "checked_in" } });
      }
      return computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
    }
  );

  // What closing a checked-in stay right now would cost — as booked, and
  // re-billed on the actual stay — so staff can pick, and see exactly what
  // to collect (or refund) before checkout is allowed.
  fastify.get(
    "/bookings/:id/checkout-preview",
    { preHandler: [fastify.authenticate, requirePermission("bookings.view")] },
    async (request, reply) => {
      const stay = await computeStayBreakdown(fastify.prisma, request.user.tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });
      if (!stay.bookings.some((b) => b.status.code === "checked_in")) return reply.code(409).send({ error: "This stay isn't checked in" });
      return checkoutOptions(stay, new Date());
    }
  );

  // Checks out every checked-in room of the stay, all-or-nothing: applies
  // the billing choice, records the settling payment(s) or refund, refuses
  // unless the balance lands on exactly zero, then finalizes the tax
  // invoice (figures + full printed snapshot) in the same transaction.
  fastify.post(
    "/bookings/:id/checkout",
    { preHandler: [fastify.authenticate, requirePermission("bookings.edit")] },
    async (request, reply) => {
      const parsed = checkoutSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const { billing, payments = [], refund } = parsed.data;
      const tenantId = request.user.tenantId;
      const userId = request.user.id;

      if (payments.length && !request.user.permissions.has("payments.record")) return reply.code(403).send({ error: "Missing permission: payments.record" });
      if (refund && !request.user.permissions.has("payments.record")) return reply.code(403).send({ error: "Missing permission: payments.record" });

      const [checkedOut, paidStatus, dirty, methods] = await Promise.all([
        bookingStatusByCode(fastify.prisma, tenantId, "checked_out"),
        fastify.prisma.status.findFirst({ where: { tenantId, domain: "payment", code: "paid" } }),
        fastify.prisma.status.findFirst({ where: { tenantId, domain: "room", code: "dirty" } }),
        fastify.prisma.paymentMethod.findMany({ where: { tenantId, isActive: true } }),
      ]);
      if (!checkedOut || !paidStatus) return reply.code(500).send({ error: "Checkout statuses are not configured" });
      const methodIds = new Set(methods.map((m) => m.id));
      if ([...payments, ...(refund ? [refund] : [])].some((p) => !methodIds.has(p.methodId))) return reply.code(400).send({ error: "Unknown payment method" });

      const at = new Date();
      let result;
      try {
        result = await fastify.prisma.$transaction(async (tx) => {
          const before = await computeStayBreakdown(tx, tenantId, request.params.id);
          if (!before) throw new HttpError(404, "Booking not found");
          const leaving = before.bookings.filter((b) => b.status.code === "checked_in");
          if (leaving.length === 0) throw new HttpError(409, "This stay isn't checked in");

          if (billing === "actual") {
            for (const b of leaving) {
              const nights = nightsBetween(b.checkIn, at);
              await tx.booking.update({ where: { id: b.id }, data: { checkOut: at, totalAmount: round2(Number(b.ratePerNight) * nights) } });
            }
          }

          for (const p of payments) {
            await tx.payment.create({
              data: { tenantId, bookingId: before.primary.id, type: "payment", methodId: p.methodId, statusId: paidStatus.id, amount: p.amount, referenceNote: p.referenceNote ?? null, recordedById: userId, ...(p.paidAt ? { recordedAt: p.paidAt } : {}) },
            });
          }

          let settled = await computeStayBreakdown(tx, tenantId, request.params.id);
          if (refund && settled.summary.balanceDue < 0) {
            await tx.payment.create({
              data: { tenantId, bookingId: before.primary.id, type: "refund", methodId: refund.methodId, statusId: paidStatus.id, amount: -settled.summary.balanceDue, referenceNote: refund.referenceNote || "Refund of overpayment at checkout", recordedById: userId },
            });
            settled = await computeStayBreakdown(tx, tenantId, request.params.id);
          }

          const { balanceDue } = settled.summary;
          if (balanceDue > 0) throw new HttpError(409, `${rupees(balanceDue)} is still due — collect it before checking out.`, { balanceDue });
          if (balanceDue < 0) throw new HttpError(409, `${rupees(-balanceDue)} was overpaid — refund it to the guest before checking out.`, { balanceDue });

          for (const b of leaving) {
            await tx.booking.update({ where: { id: b.id }, data: { statusId: checkedOut.id, actualCheckOut: at } });
          }

          const final = await computeStayBreakdown(tx, tenantId, request.params.id);
          const finalized = {
            ...invoiceFiguresFrom(final),
            guestSnapshot: guestSnapshotFrom(final.primary.guest),
            snapshot: invoiceSnapshotFrom(final),
            isFinalized: true,
            generatedAt: at,
            generatedById: userId,
          };
          const reserved = await tx.invoice.findFirst({ where: { tenantId, bookingId: { in: final.bookings.map((b) => b.id) }, isCancelled: false } });
          const invoice = reserved
            ? reserved.isFinalized
              ? reserved
              : await tx.invoice.update({ where: { id: reserved.id }, data: finalized })
            : await tx.invoice.create({ data: { tenantId, bookingId: final.primary.id, invoiceNumber: await nextInvoiceNumber(tx, tenantId), ...finalized } });

          return { leaving, invoice, final, before };
        });
      } catch (err) {
        return sendHttpError(reply, err);
      }

      // The room turns Dirty for housekeeping — unless someone else is
      // (wrongly) still checked in there, in which case it stays Occupied.
      for (const b of result.leaving) {
        const stillOccupied = await findCurrentOccupant(fastify.prisma, { tenantId, roomId: b.roomId });
        if (dirty && !stillOccupied) await fastify.prisma.room.update({ where: { id: b.roomId }, data: { statusId: dirty.id } });
        await recordAudit(fastify.prisma, { tenantId, userId, action: "booking.status_change", entityType: "Booking", entityId: b.id, metadata: { statusCode: "checked_out", billing } });
      }
      await recordAudit(fastify.prisma, {
        tenantId,
        userId,
        action: "invoice.finalize",
        entityType: "Invoice",
        entityId: result.invoice.id,
        metadata: { bookingId: result.final.primary.id, invoiceNumber: result.invoice.invoiceNumber, total: result.invoice.total, billing },
      });
      for (const p of payments) {
        await recordAudit(fastify.prisma, { tenantId, userId, action: "payment.record", entityType: "Payment", entityId: result.final.primary.id, metadata: { amount: p.amount, atCheckout: true } });
      }
      if (refund) {
        await recordAudit(fastify.prisma, { tenantId, userId, action: "payment.refund", entityType: "Payment", entityId: result.final.primary.id, metadata: { atCheckout: true } });
      }

      return { invoice: result.invoice, summary: result.final.summary };
    }
  );

  // Cancels every room of a stay that hasn't been checked in, and — because
  // a cancellation hands back everything the guest paid — records the full
  // refund in the same transaction. The reserved invoice number is
  // cancelled along with it.
  fastify.post(
    "/bookings/:id/cancel",
    { preHandler: [fastify.authenticate, requirePermission("bookings.cancel")] },
    async (request, reply) => {
      const parsed = cancelStaySchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const { refund, reason } = parsed.data;
      const tenantId = request.user.tenantId;
      const userId = request.user.id;

      const [cancelled, paidStatus] = await Promise.all([
        bookingStatusByCode(fastify.prisma, tenantId, "cancelled"),
        fastify.prisma.status.findFirst({ where: { tenantId, domain: "payment", code: "paid" } }),
      ]);
      if (!cancelled || !paidStatus) return reply.code(500).send({ error: "Cancellation statuses are not configured" });
      if (refund) {
        const method = await fastify.prisma.paymentMethod.findFirst({ where: { id: refund.methodId, tenantId, isActive: true } });
        if (!method) return reply.code(400).send({ error: "Unknown payment method" });
        if (!request.user.permissions.has("payments.record")) return reply.code(403).send({ error: "Missing permission: payments.record" });
      }

      let result;
      try {
        result = await fastify.prisma.$transaction(async (tx) => {
          const stay = await computeStayBreakdown(tx, tenantId, request.params.id);
          if (!stay) throw new HttpError(404, "Booking not found");
          const open = stay.bookings.filter((b) => !b.status.isTerminal);
          if (open.length === 0) throw new HttpError(409, "This booking is already closed");
          if (open.some((b) => b.status.code === "checked_in")) throw new HttpError(409, "A checked-in guest can't be cancelled — check them out instead");

          const refundDue = stay.summary.advancePaid;
          if (refundDue > 0 && !refund) {
            throw new HttpError(409, `The guest has paid ${rupees(refundDue)} — choose how it's refunded to cancel this booking.`, { refundDue });
          }

          for (const b of open) await tx.booking.update({ where: { id: b.id }, data: { statusId: cancelled.id } });
          const refundRow =
            refundDue > 0
              ? await tx.payment.create({
                  data: { tenantId, bookingId: stay.primary.id, type: "refund", methodId: refund.methodId, statusId: paidStatus.id, amount: refundDue, referenceNote: refund.referenceNote || "Refund on cancellation", recordedById: userId },
                })
              : null;

          const invoice = await tx.invoice.findFirst({ where: { tenantId, bookingId: { in: stay.bookings.map((b) => b.id) }, isCancelled: false, isFinalized: false } });
          if (invoice) {
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { isCancelled: true, cancelledAt: new Date(), cancelledById: userId, cancellationReason: reason?.trim() || "Booking cancelled" },
            });
          }
          return { open, refundRow, invoice, refundDue };
        });
      } catch (err) {
        return sendHttpError(reply, err);
      }

      for (const b of result.open) {
        await recordAudit(fastify.prisma, { tenantId, userId, action: "booking.status_change", entityType: "Booking", entityId: b.id, metadata: { statusCode: "cancelled" } });
      }
      if (result.refundRow) {
        await recordAudit(fastify.prisma, { tenantId, userId, action: "payment.refund", entityType: "Payment", entityId: result.refundRow.id, metadata: { amount: result.refundDue, onCancellation: true } });
      }
      if (result.invoice) {
        await recordAudit(fastify.prisma, { tenantId, userId, action: "invoice.cancel", entityType: "Invoice", entityId: result.invoice.id, metadata: { invoiceNumber: result.invoice.invoiceNumber, reason: "Booking cancelled" } });
      }

      return computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
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
      if (isVoidStatus(booking.status)) return reply.code(409).send({ error: `This booking is ${booking.status.label.toLowerCase()} — nothing can be charged to it` });
      if (isBookingLocked(booking.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — adding a charge now requires the bookings.correct permission" });
      }

      if (parsed.data.type === "discount") {
        const stay = await computeStayBreakdown(fastify.prisma, tenantId, booking.id);
        const room = round2(stay.summary.roomsInclTax - stay.summary.discountEntered);
        if (parsed.data.amount > room) {
          return reply.code(400).send({ error: `Discount can't be more than the remaining room charges (${rupees(Math.max(0, room))}).` });
        }
      }

      const charge = await fastify.prisma.bookingCharge.create({
        data: { tenantId, bookingId: booking.id, createdById: request.user.id, ...parsed.data },
      });
      await refreshReservedInvoice(fastify.prisma, tenantId, booking.id);

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
      await refreshReservedInvoice(fastify.prisma, request.user.tenantId, existing.bookingId);

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
