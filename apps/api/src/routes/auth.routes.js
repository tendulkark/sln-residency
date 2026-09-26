import argon2 from "argon2";
import { loginSchema, changePasswordSchema } from "@sln/shared-schemas";
import { verifyRefreshToken } from "#src/lib/tokens.js";
import { recordAudit } from "#src/lib/audit.js";
import {
  REFRESH_COOKIE,
  sessionPayload,
  startSession,
  renewSession,
  clearRefreshCookie,
} from "#src/lib/sessions.js";

async function loadPermissionCodes(prisma, roleId) {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });
  return rolePermissions.map((rp) => rp.permission.code);
}

export default async function authRoutes(fastify) {
  fastify.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await fastify.prisma.user.findFirst({
      where: { email, isActive: true },
      include: { role: true, tenant: true },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (!user.tenant.isActive) {
      return reply.code(403).send({ error: "This hotel's account is inactive" });
    }

    // Each sign-in is its own device session — signing in on a phone
    // leaves the front-desk PC signed in.
    const accessToken = await startSession(fastify.prisma, request, reply, user);
    const permissions = await loadPermissionCodes(fastify.prisma, user.roleId);

    return { accessToken, ...sessionPayload(user, permissions) };
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) return reply.code(401).send({ error: "No refresh token" });

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const session = payload.sid
      ? await fastify.prisma.userSession.findUnique({
          where: { id: payload.sid },
          include: { user: { include: { role: true, tenant: true } } },
        })
      : null;
    const user = session?.user;

    const accessToken =
      session && session.userId === payload.sub && user.isActive && user.tenant.isActive
        ? await renewSession(fastify.prisma, request, reply, session, token)
        : null;
    if (!accessToken) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: "Refresh token no longer valid" });
    }

    const permissions = await loadPermissionCodes(fastify.prisma, user.roleId);
    return { accessToken, ...sessionPayload(user, permissions) };
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        // Ends only this device's session — any other device stays signed in.
        const payload = verifyRefreshToken(token);
        if (payload.sid) {
          await fastify.prisma.userSession.deleteMany({ where: { id: payload.sid, userId: payload.sub } });
        }
      } catch {
        // token already invalid/expired — nothing to revoke
      }
    }
    clearRefreshCookie(reply);
    return { ok: true };
  });

  // Self-service — the Profile screen, available to every signed-in role
  // regardless of users.manage. Re-typing the current password is the
  // reverification (not the still-valid access token), so unlike an
  // Admin's /users/:id/reset-password this doesn't need to force every
  // other device to sign in again.
  fastify.post("/auth/change-password", { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user || !(await argon2.verify(user.passwordHash, parsed.data.currentPassword))) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(parsed.data.newPassword) },
    });

    await recordAudit(fastify.prisma, {
      tenantId: user.tenantId,
      userId: user.id,
      action: "user.change_password",
      entityType: "User",
      entityId: user.id,
    });

    return { ok: true };
  });

  // The current user/tenant/permissions, re-read from the DB. The web app
  // polls this (on focus, on moving between modules, on a module refresh,
  // and after any 403) so a role change an Admin just made shows up in an
  // open console without signing out and back in.
  fastify.get("/me", { preHandler: fastify.authenticate }, async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      include: { role: true, tenant: true },
    });
    return sessionPayload(user, [...request.user.permissions]);
  });

  // The caller's own signed-in devices, newest activity first — the
  // Profile screen's "Signed-in devices" list.
  fastify.get("/auth/sessions", { preHandler: fastify.authenticate }, async (request) => {
    const sessions = await fastify.prisma.userSession.findMany({
      where: { userId: request.user.id, tenantId: request.user.tenantId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true },
    });
    return sessions.map((s) => ({ ...s, isCurrent: s.id === request.user.sessionId }));
  });

  // Signs one of the caller's own devices out (e.g. a lost phone). That
  // device's next request is refused, not just its next refresh.
  fastify.delete("/auth/sessions/:id", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { count } = await fastify.prisma.userSession.deleteMany({
      where: { id: request.params.id, userId: request.user.id, tenantId: request.user.tenantId },
    });
    if (count === 0) return reply.code(404).send({ error: "That device is already signed out" });

    await recordAudit(fastify.prisma, {
      tenantId: request.user.tenantId,
      userId: request.user.id,
      action: "user.session_revoke",
      entityType: "User",
      entityId: request.user.id,
    });
    return { ok: true };
  });

  fastify.post("/auth/sessions/revoke-others", { preHandler: fastify.authenticate }, async (request) => {
    const { count } = await fastify.prisma.userSession.deleteMany({
      where: { userId: request.user.id, tenantId: request.user.tenantId, id: { not: request.user.sessionId } },
    });

    await recordAudit(fastify.prisma, {
      tenantId: request.user.tenantId,
      userId: request.user.id,
      action: "user.session_revoke_others",
      entityType: "User",
      entityId: request.user.id,
      metadata: { count },
    });
    return { ok: true, count };
  });
}
