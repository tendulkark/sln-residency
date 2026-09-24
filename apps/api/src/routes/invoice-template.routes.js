import { invoiceTemplateSchema, resolveInvoiceTemplate } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

export default async function invoiceTemplateRoutes(fastify) {
  // Anyone who can print a bill needs the design to render it, so reading
  // is open to every signed-in staff member — changing it is the gated action.
  fastify.get("/invoice-template", { preHandler: fastify.authenticate }, async (request) => {
    const row = await fastify.prisma.invoiceTemplate.findUnique({ where: { tenantId: request.user.tenantId } });
    return resolveInvoiceTemplate(row?.config);
  });

  // Replaces the whole design; omitted keys fall back to their defaults,
  // which is also how "Reset to defaults" works.
  fastify.put(
    "/invoice-template",
    { preHandler: [fastify.authenticate, requirePermission("invoices.customize")] },
    async (request, reply) => {
      const parsed = invoiceTemplateSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid invoice design", details: parsed.error.flatten() });
      }

      const tenantId = request.user.tenantId;
      const config = parsed.data;
      const existing = await fastify.prisma.invoiceTemplate.findUnique({ where: { tenantId } });
      const before = resolveInvoiceTemplate(existing?.config);

      const row = await fastify.prisma.invoiceTemplate.upsert({
        where: { tenantId },
        create: { tenantId, config },
        update: { config },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "invoicetemplate.update",
        entityType: "InvoiceTemplate",
        entityId: row.id,
        metadata: { fields: Object.keys(config).filter((key) => config[key] !== before[key]) },
      });

      return resolveInvoiceTemplate(row.config);
    }
  );
}
