import { recordPaymentSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";
import { isBookingLocked, computeStayBreakdown } from "#src/lib/billing.js";

function rupees(value) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayRange(dateStr) {
  const start = dateStr ? new Date(dateStr) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export default async function paymentsRoutes(fastify) {
  // Read-only lookup for the record-payment form's method dropdown.
  fastify.get(
    "/payment-methods",
    { preHandler: [fastify.authenticate, requirePermission("payments.view")] },
    async (request) => {
      return fastify.prisma.paymentMethod.findMany({
        where: { tenantId: request.user.tenantId, isActive: true },
        orderBy: { name: "asc" },
      });
    }
  );

  fastify.get(
    "/payments",
    { preHandler: [fastify.authenticate, requirePermission("payments.view")] },
    async (request) => {
      const { date, bookingId } = request.query;
      const { start, end } = dayRange(date);

      return fastify.prisma.payment.findMany({
        where: {
          tenantId: request.user.tenantId,
          ...(bookingId ? { bookingId } : { recordedAt: { gte: start, lt: end } }),
        },
        include: { method: true, status: true, booking: { include: { guest: true, room: true } } },
        orderBy: { recordedAt: "desc" },
      });
    }
  );

  fastify.post(
    "/payments",
    { preHandler: [fastify.authenticate, requirePermission("payments.record")] },
    async (request, reply) => {
      const parsed = recordPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const { bookingId, type, methodId, statusId, amount, referenceNote, paidAt } = parsed.data;
      const tenantId = request.user.tenantId;

      const booking = await fastify.prisma.booking.findFirst({ where: { id: bookingId, tenantId }, include: { status: true } });
      if (!booking) return reply.code(400).send({ error: "Unknown booking" });
      if (isBookingLocked(booking.status) && !request.user.permissions.has("bookings.correct")) {
        return reply.code(403).send({ error: "This booking is checked out — recording a payment now requires the bookings.correct permission" });
      }

      const method = await fastify.prisma.paymentMethod.findFirst({ where: { id: methodId, tenantId, isActive: true } });
      if (!method) return reply.code(400).send({ error: "Unknown payment method" });

      const status = await fastify.prisma.status.findFirst({ where: { id: statusId, tenantId, domain: "payment" } });
      if (!status) return reply.code(400).send({ error: "Unknown payment status" });

      // Money only moves to settle the bill: a payment can't go past what's
      // due, and a refund can only hand back what was overpaid (a cancelled
      // stay bills nothing, so everything it received is refundable).
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, bookingId);
      const { balanceDue, stayIsVoid } = stay.summary;
      if (type === "payment") {
        if (stayIsVoid) return reply.code(409).send({ error: "This booking is cancelled — no payment can be taken on it" });
        if (amount > balanceDue) {
          return reply.code(409).send({
            error: balanceDue > 0 ? `Only ${rupees(balanceDue)} is due — the payment can't be more than that.` : "Nothing is due on this stay.",
            balanceDue,
          });
        }
      } else if (amount > -balanceDue) {
        return reply.code(409).send({
          error: balanceDue < 0 ? `Only ${rupees(-balanceDue)} was overpaid — that's the most that can be refunded.` : "Nothing has been overpaid, so there's nothing to refund.",
          balanceDue,
        });
      }

      const payment = await fastify.prisma.payment.create({
        data: {
          tenantId,
          bookingId,
          type,
          methodId,
          statusId,
          amount,
          referenceNote,
          recordedById: request.user.id,
          ...(paidAt ? { recordedAt: paidAt } : {}),
        },
        include: { method: true, status: true },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: type === "refund" ? "payment.refund" : "payment.record",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { bookingId, amount, methodCode: method.code },
      });

      return reply.code(201).send(payment);
    }
  );
}
