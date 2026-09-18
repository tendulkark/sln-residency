import { recordPaymentSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

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
      const { bookingId, methodId, statusId, amount, referenceNote, paidAt } = parsed.data;
      const tenantId = request.user.tenantId;

      const booking = await fastify.prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
      if (!booking) return reply.code(400).send({ error: "Unknown booking" });

      const method = await fastify.prisma.paymentMethod.findFirst({ where: { id: methodId, tenantId, isActive: true } });
      if (!method) return reply.code(400).send({ error: "Unknown payment method" });

      const status = await fastify.prisma.status.findFirst({ where: { id: statusId, tenantId, domain: "payment" } });
      if (!status) return reply.code(400).send({ error: "Unknown payment status" });

      const payment = await fastify.prisma.payment.create({
        data: {
          tenantId,
          bookingId,
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
        action: "payment.record",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { bookingId, amount, methodCode: method.code },
      });

      return reply.code(201).send(payment);
    }
  );
}
