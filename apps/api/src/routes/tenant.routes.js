import { tenantSettingsSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";

const TENANT_PROFILE_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  logoUrl: true,
  primaryColor: true,
  address: true,
  phone: true,
  email: true,
  gstin: true,
  currency: true,
};

export default async function tenantRoutes(fastify) {
  // Any authenticated staff member can read their own hotel's profile
  // (Settings screen, invoice letterhead) — editing is the gated action.
  fastify.get("/tenant", { preHandler: fastify.authenticate }, async (request) => {
    return fastify.prisma.tenant.findUnique({ where: { id: request.user.tenantId }, select: TENANT_PROFILE_SELECT });
  });

  fastify.patch(
    "/tenant",
    { preHandler: [fastify.authenticate, requirePermission("settings.manage")] },
    async (request, reply) => {
      const parsed = tenantSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const data = { ...parsed.data };
      if (data.email === "") data.email = null;

      const tenant = await fastify.prisma.tenant.update({
        where: { id: request.user.tenantId },
        data,
        select: TENANT_PROFILE_SELECT,
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "tenant.update",
        entityType: "Tenant",
        entityId: tenant.id,
        metadata: { fields: Object.keys(data) },
      });

      return tenant;
    }
  );
}
