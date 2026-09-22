import { requirePermission } from "#src/lib/permissions.js";

// Just enough to populate the Staff module's role picker — a full
// roles/permissions editor (create/rename a role, toggle its permission
// checkboxes) is a separate, later Phase 4 slice (roles.manage). Gated on
// users.manage since staff management is its only consumer today.
export default async function rolesRoutes(fastify) {
  fastify.get(
    "/roles",
    { preHandler: [fastify.authenticate, requirePermission("users.manage")] },
    async (request) => {
      return fastify.prisma.role.findMany({
        where: { tenantId: request.user.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isSystemRole: true },
      });
    }
  );
}
