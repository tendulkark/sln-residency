import argon2 from "argon2";
import { userSchema, userUpdateSchema, resetPasswordSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, isSystemRole: true } },
};

function userRow(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    createdAt: u.createdAt,
    roleId: u.roleId,
    roleName: u.role.name,
  };
}

// Staff accounts — the login every worker (front desk, housekeeping, etc.)
// signs in with. Only an Admin (users.manage) can reach any of this; what a
// given login can actually *do* once signed in comes entirely from its
// Role's permissions (RolePermission rows), never anything hardcoded here
// (AI_RULES.md #1/#3). There's deliberately no DELETE — a user has
// createdBy/recordedBy history all over the schema with no cascade, so
// "removing" one always means deactivating it (isActive: false), the same
// never-hard-delete posture invoices take.
export default async function usersRoutes(fastify) {
  fastify.get(
    "/users",
    { preHandler: [fastify.authenticate, requirePermission("users.manage")] },
    async (request) => {
      const users = await fastify.prisma.user.findMany({
        where: { tenantId: request.user.tenantId },
        select: USER_SELECT,
        orderBy: { name: "asc" },
      });
      return users.map(userRow);
    }
  );

  fastify.post(
    "/users",
    { preHandler: [fastify.authenticate, requirePermission("users.manage")] },
    async (request, reply) => {
      const parsed = userSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;
      const { password, ...data } = parsed.data;

      const role = await fastify.prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
      if (!role) return reply.code(400).send({ error: "That role doesn't exist" });

      let user;
      try {
        user = await fastify.prisma.user.create({
          data: { tenantId, ...data, passwordHash: await argon2.hash(password) },
          select: USER_SELECT,
        });
      } catch (err) {
        if (err.code === "P2002") return reply.code(409).send({ error: "A staff account with this email already exists" });
        throw err;
      }

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        metadata: { name: user.name, email: user.email, roleId: user.roleId },
      });

      return reply.code(201).send(userRow(user));
    }
  );

  fastify.patch(
    "/users/:id",
    { preHandler: [fastify.authenticate, requirePermission("users.manage")] },
    async (request, reply) => {
      const parsed = userUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;
      const data = parsed.data;

      const existing = await fastify.prisma.user.findFirst({
        where: { id: request.params.id, tenantId },
        include: { role: true },
      });
      if (!existing) return reply.code(404).send({ error: "Staff account not found" });

      // Self-lockout guards — an Admin editing their own row can still
      // update their name/email here, just not the two fields that could
      // strand them (or the whole tenant) out of the console.
      const isSelf = existing.id === request.user.id;
      if (isSelf && data.isActive === false) {
        return reply.code(400).send({ error: "You can't deactivate your own account" });
      }
      if (isSelf && data.roleId && data.roleId !== existing.roleId) {
        return reply.code(400).send({ error: "You can't change your own role" });
      }

      let nextRole = existing.role;
      if (data.roleId && data.roleId !== existing.roleId) {
        nextRole = await fastify.prisma.role.findFirst({ where: { id: data.roleId, tenantId } });
        if (!nextRole) return reply.code(400).send({ error: "That role doesn't exist" });
      }

      // Deactivating, or moving off the system role, the tenant's *last*
      // active holder of it would leave no one able to manage staff/roles
      // at all — a lock-out nothing in this console could recover from, so
      // it's refused outright rather than just warned about.
      const losesSystemRole = existing.role.isSystemRole && (data.isActive === false || (data.roleId && !nextRole.isSystemRole));
      if (losesSystemRole) {
        const otherActiveHolders = await fastify.prisma.user.count({
          where: { tenantId, isActive: true, id: { not: existing.id }, role: { isSystemRole: true } },
        });
        if (otherActiveHolders === 0) {
          return reply.code(409).send({ error: "This hotel needs at least one active Admin — set up another Admin before changing this one" });
        }
      }

      let user;
      try {
        user = await fastify.prisma.user.update({ where: { id: existing.id }, data, select: USER_SELECT });
      } catch (err) {
        if (err.code === "P2002") return reply.code(409).send({ error: "A staff account with this email already exists" });
        throw err;
      }

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "user.update",
        entityType: "User",
        entityId: user.id,
        metadata: data,
      });

      return userRow(user);
    }
  );

  // An Admin setting a new password for someone else's account (locked
  // out, forgotten, or a fresh hire's first login). Clears the account's
  // refresh token so every device it was signed into needs to sign in
  // again with the new password — the self-service change below doesn't,
  // since re-entering the current password there already reverified the
  // active session.
  fastify.post(
    "/users/:id/reset-password",
    { preHandler: [fastify.authenticate, requirePermission("users.manage")] },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const tenantId = request.user.tenantId;

      const existing = await fastify.prisma.user.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Staff account not found" });

      await fastify.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await argon2.hash(parsed.data.password), refreshTokenHash: null },
      });

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "user.reset_password",
        entityType: "User",
        entityId: existing.id,
      });

      return { ok: true };
    }
  );
}
