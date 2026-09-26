import { STATUS_DOMAINS, DEFAULTABLE_STATUS_CODES, statusUpdateSchema, statusOrderSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

const VALID_DOMAINS = new Set(STATUS_DOMAINS);

// Room/booking/payment statuses. The workflow (check-in, checkout, the
// dashboard's buckets, reports) finds the built-in ones by code, so a
// status's code, domain and terminal flag never change here — what a hotel
// can make its own is what staff see: the label, the color, the order, and
// which status a new booking starts in (see DEFAULTABLE_STATUS_CODES).
export default async function statusesRoutes(fastify) {
  // Read-only lookup used to populate status dropdowns/badges. Any
  // authenticated staff member may read these.
  fastify.get("/statuses", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { domain } = request.query;
    if (domain && !VALID_DOMAINS.has(domain)) {
      return reply.code(400).send({ error: `domain must be one of ${[...VALID_DOMAINS].join(", ")}` });
    }

    return fastify.prisma.status.findMany({
      where: { tenantId: request.user.tenantId, ...(domain ? { domain } : {}) },
      orderBy: [{ domain: "asc" }, { sortOrder: "asc" }],
    });
  });

  fastify.patch(
    "/statuses/:id",
    { preHandler: [fastify.authenticate, requirePermission("statuses.manage")] },
    async (request, reply) => {
      const parsed = statusUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const { isDefault, ...fields } = parsed.data;

      const existing = await fastify.prisma.status.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Status not found" });

      if (fields.label && fields.label.toLowerCase() !== existing.label.toLowerCase()) {
        const clash = await fastify.prisma.status.findFirst({
          where: { tenantId, domain: existing.domain, id: { not: existing.id }, label: { equals: fields.label, mode: "insensitive" } },
        });
        if (clash) return reply.code(409).send({ error: `Another ${existing.domain} status is already called “${fields.label}”` });
      }

      const makeDefault = isDefault && !existing.isDefault;
      if (makeDefault && !DEFAULTABLE_STATUS_CODES[existing.domain].includes(existing.code)) {
        return reply.code(400).send({ error: `“${existing.label}” can't be the default ${existing.domain} status` });
      }

      const status = await fastify.prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.status.updateMany({ where: { tenantId, domain: existing.domain, isDefault: true }, data: { isDefault: false } });
        }
        return tx.status.update({ where: { id: existing.id }, data: { ...fields, ...(makeDefault ? { isDefault: true } : {}) } });
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "status.update",
        entityType: "Status",
        entityId: status.id,
        metadata: {
          domain: existing.domain,
          code: existing.code,
          before: { label: existing.label, color: existing.color, isDefault: existing.isDefault },
          after: parsed.data,
        },
      });

      return status;
    }
  );

  // Saves a domain's whole top-to-bottom order at once (the order dropdowns,
  // badges and legends list them in).
  fastify.put(
    "/statuses/order",
    { preHandler: [fastify.authenticate, requirePermission("statuses.manage")] },
    async (request, reply) => {
      const parsed = statusOrderSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const { domain, ids } = parsed.data;

      const current = await fastify.prisma.status.findMany({ where: { tenantId, domain }, orderBy: { sortOrder: "asc" } });
      const currentIds = new Set(current.map((s) => s.id));
      if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => currentIds.has(id))) {
        return reply.code(400).send({ error: `The order must list every ${domain} status exactly once` });
      }

      await fastify.prisma.$transaction(ids.map((id, index) => fastify.prisma.status.update({ where: { id }, data: { sortOrder: index + 1 } })));

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "status.reorder",
        entityType: "Status",
        entityId: domain,
        metadata: { domain, before: current.map((s) => s.code), after: ids.map((id) => current.find((s) => s.id === id).code) },
      });

      return fastify.prisma.status.findMany({ where: { tenantId, domain }, orderBy: { sortOrder: "asc" } });
    }
  );
}
