import { paymentMethodSchema, paymentMethodUpdateSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";
import { codeFromLabel } from "#src/lib/codes.js";

// The ways a guest can pay at the desk (AI_RULES.md #1 — never a hardcoded
// list). Payments point at their method row forever, so a method that has
// been used is switched off rather than deleted: it disappears from the
// record-payment pickers but keeps labelling past payments and reports.
export default async function paymentMethodsRoutes(fastify) {
  // The record-payment pickers read the active methods; Settings → Payment
  // methods (?all=true) also needs the switched-off ones and how often each
  // has been used.
  fastify.get("/payment-methods", { preHandler: fastify.authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const perms = request.user.permissions;

    if (request.query.all === "true") {
      if (!perms.has("paymentmethods.manage")) return reply.code(403).send({ error: "Missing permission: paymentmethods.manage" });
      const methods = await fastify.prisma.paymentMethod.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        include: { _count: { select: { payments: true } } },
      });
      return methods.map(({ _count, ...m }) => ({ ...m, paymentCount: _count.payments }));
    }

    if (!perms.has("payments.view")) return reply.code(403).send({ error: "Missing permission: payments.view" });
    return fastify.prisma.paymentMethod.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
    });
  });

  fastify.post(
    "/payment-methods",
    { preHandler: [fastify.authenticate, requirePermission("paymentmethods.manage")] },
    async (request, reply) => {
      const parsed = paymentMethodSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const { name } = parsed.data;

      const existing = await fastify.prisma.paymentMethod.findMany({ where: { tenantId }, select: { code: true, name: true } });
      if (existing.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        return reply.code(409).send({ error: `There's already a payment method called “${name}”` });
      }

      const method = await fastify.prisma.paymentMethod.create({
        data: { tenantId, name, code: codeFromLabel(name, existing.map((m) => m.code)) },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "paymentmethod.create",
        entityType: "PaymentMethod",
        entityId: method.id,
        metadata: { name: method.name, code: method.code },
      });

      return reply.code(201).send({ ...method, paymentCount: 0 });
    }
  );

  fastify.patch(
    "/payment-methods/:id",
    { preHandler: [fastify.authenticate, requirePermission("paymentmethods.manage")] },
    async (request, reply) => {
      const parsed = paymentMethodUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const data = parsed.data;

      const existing = await fastify.prisma.paymentMethod.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Payment method not found" });

      if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
        const clash = await fastify.prisma.paymentMethod.findFirst({
          where: { tenantId, id: { not: existing.id }, name: { equals: data.name, mode: "insensitive" } },
        });
        if (clash) return reply.code(409).send({ error: `There's already a payment method called “${data.name}”` });
      }

      // With nothing left switched on, the desk couldn't record a payment,
      // a checkout settlement or a refund at all.
      if (data.isActive === false && existing.isActive) {
        const othersActive = await fastify.prisma.paymentMethod.count({ where: { tenantId, isActive: true, id: { not: existing.id } } });
        if (othersActive === 0) return reply.code(409).send({ error: "Keep at least one payment method switched on" });
      }

      const method = await fastify.prisma.paymentMethod.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { payments: true } } },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "paymentmethod.update",
        entityType: "PaymentMethod",
        entityId: method.id,
        metadata: { before: { name: existing.name, isActive: existing.isActive }, after: data },
      });

      const { _count, ...rest } = method;
      return { ...rest, paymentCount: _count.payments };
    }
  );

  // Only a method no payment has ever used can be removed outright (e.g. one
  // added by mistake) — anything else is switched off instead.
  fastify.delete(
    "/payment-methods/:id",
    { preHandler: [fastify.authenticate, requirePermission("paymentmethods.manage")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const existing = await fastify.prisma.paymentMethod.findFirst({
        where: { id: request.params.id, tenantId },
        include: { _count: { select: { payments: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "Payment method not found" });
      if (existing._count.payments > 0) {
        return reply.code(409).send({ error: "This method has payments recorded against it — switch it off instead" });
      }
      if (existing.isActive) {
        const othersActive = await fastify.prisma.paymentMethod.count({ where: { tenantId, isActive: true, id: { not: existing.id } } });
        if (othersActive === 0) return reply.code(409).send({ error: "Keep at least one payment method switched on" });
      }

      await fastify.prisma.paymentMethod.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "paymentmethod.delete",
        entityType: "PaymentMethod",
        entityId: existing.id,
        metadata: { name: existing.name, code: existing.code },
      });

      return { ok: true };
    }
  );
}
