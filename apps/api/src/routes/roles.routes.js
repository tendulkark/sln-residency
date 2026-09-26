import { PERMISSIONS, PERMISSION_CODES, roleSchema, roleUpdateSchema } from "@sln/shared-schemas";
import { requirePermission, requireAnyPermission, permissionCodesForRole } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

const ROLE_INCLUDE = {
  rolePermissions: { include: { permission: true } },
  _count: { select: { users: true } },
};

function roleRow(role, activeUserCounts) {
  return {
    id: role.id,
    name: role.name,
    isSystemRole: role.isSystemRole,
    createdAt: role.createdAt,
    permissionCodes: permissionCodesForRole(role),
    userCount: role._count.users,
    activeUserCount: activeUserCounts?.get(role.id) ?? 0,
  };
}

async function activeUserCountsFor(prisma, tenantId) {
  const rows = await prisma.user.groupBy({ by: ["roleId"], where: { tenantId, isActive: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.roleId, r._count._all]));
}

function unknownCodes(codes) {
  const known = new Set(PERMISSION_CODES);
  return codes.filter((c) => !known.has(c));
}

// Roles & Permissions (roles.manage). What a login can do is entirely its
// role's permissions (AI_RULES.md #1/#3). The tenant's built-in Admin role
// is read-only here and always holds every permission (lib/permissions.js
// permissionCodesForRole) — together with users.routes.js's "at least one
// active Admin" guard, that means no sequence of edits can leave a hotel
// with nobody able to manage staff and roles.
export default async function rolesRoutes(fastify) {
  // Also the Staff screen's role picker, hence either permission.
  fastify.get(
    "/roles",
    { preHandler: [fastify.authenticate, requireAnyPermission("users.manage", "roles.manage")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const [roles, activeCounts] = await Promise.all([
        fastify.prisma.role.findMany({
          where: { tenantId },
          include: ROLE_INCLUDE,
          orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
        }),
        activeUserCountsFor(fastify.prisma, tenantId),
      ]);
      return roles.map((r) => roleRow(r, activeCounts));
    }
  );

  // The permission catalog the role editor lists as checkboxes.
  fastify.get("/permissions", { preHandler: [fastify.authenticate, requirePermission("roles.manage")] }, async () => PERMISSIONS);

  fastify.post(
    "/roles",
    { preHandler: [fastify.authenticate, requirePermission("roles.manage")] },
    async (request, reply) => {
      const parsed = roleSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const { name } = parsed.data;
      const codes = [...new Set(parsed.data.permissionCodes)];

      const unknown = unknownCodes(codes);
      if (unknown.length) return reply.code(400).send({ error: `Unknown permission(s): ${unknown.join(", ")}` });

      const clash = await fastify.prisma.role.findFirst({ where: { tenantId, name: { equals: name, mode: "insensitive" } } });
      if (clash) return reply.code(409).send({ error: `There's already a role called “${clash.name}”` });

      const permissions = await fastify.prisma.permission.findMany({ where: { code: { in: codes } } });
      const role = await fastify.prisma.role.create({
        data: {
          tenantId,
          name,
          isSystemRole: false,
          rolePermissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
        include: ROLE_INCLUDE,
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "role.create",
        entityType: "Role",
        entityId: role.id,
        metadata: { name, permissionCodes: codes },
      });

      return reply.code(201).send(roleRow(role));
    }
  );

  fastify.patch(
    "/roles/:id",
    { preHandler: [fastify.authenticate, requirePermission("roles.manage")] },
    async (request, reply) => {
      const parsed = roleUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      const tenantId = request.user.tenantId;
      const { name } = parsed.data;
      const codes = parsed.data.permissionCodes ? [...new Set(parsed.data.permissionCodes)] : null;

      const existing = await fastify.prisma.role.findFirst({ where: { id: request.params.id, tenantId }, include: ROLE_INCLUDE });
      if (!existing) return reply.code(404).send({ error: "Role not found" });
      if (existing.isSystemRole) {
        return reply.code(409).send({ error: `The built-in ${existing.name} role always has full access and can't be changed` });
      }

      if (codes) {
        const unknown = unknownCodes(codes);
        if (unknown.length) return reply.code(400).send({ error: `Unknown permission(s): ${unknown.join(", ")}` });
        // Taking roles.manage off your own role would shut this screen on
        // you mid-edit — another Admin has to make that call.
        if (existing.id === request.user.roleId && !codes.includes("roles.manage")) {
          return reply.code(409).send({ error: "You can't remove Roles & Permissions access from your own role" });
        }
      }

      if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
        const clash = await fastify.prisma.role.findFirst({
          where: { tenantId, id: { not: existing.id }, name: { equals: name, mode: "insensitive" } },
        });
        if (clash) return reply.code(409).send({ error: `There's already a role called “${clash.name}”` });
      }

      const before = permissionCodesForRole(existing);
      const role = await fastify.prisma.$transaction(async (tx) => {
        if (codes) {
          const permissions = await tx.permission.findMany({ where: { code: { in: codes } } });
          await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
          await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: existing.id, permissionId: p.id })) });
        }
        return tx.role.update({ where: { id: existing.id }, data: name ? { name } : {}, include: ROLE_INCLUDE });
      });

      const after = permissionCodesForRole(role);
      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "role.update",
        entityType: "Role",
        entityId: role.id,
        metadata: {
          ...(name && name !== existing.name ? { renamed: { from: existing.name, to: name } } : {}),
          ...(codes
            ? { granted: after.filter((c) => !before.includes(c)), revoked: before.filter((c) => !after.includes(c)) }
            : {}),
        },
      });

      return roleRow(role, await activeUserCountsFor(fastify.prisma, tenantId));
    }
  );

  // A role can go once nobody — active or not — is assigned to it (user rows
  // keep their roleId even when deactivated, and there's no cascade).
  fastify.delete(
    "/roles/:id",
    { preHandler: [fastify.authenticate, requirePermission("roles.manage")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const existing = await fastify.prisma.role.findFirst({ where: { id: request.params.id, tenantId }, include: ROLE_INCLUDE });
      if (!existing) return reply.code(404).send({ error: "Role not found" });
      if (existing.isSystemRole) return reply.code(409).send({ error: `The built-in ${existing.name} role can't be deleted` });
      if (existing._count.users > 0) {
        return reply.code(409).send({
          error: `${existing._count.users} staff account(s) still use this role — move them to another role on the Staff screen first`,
        });
      }

      await fastify.prisma.role.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "role.delete",
        entityType: "Role",
        entityId: existing.id,
        metadata: { name: existing.name, permissionCodes: permissionCodesForRole(existing) },
      });

      return { ok: true };
    }
  );
}
