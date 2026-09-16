import argon2 from "argon2";
import { loginSchema } from "@sln/shared-schemas";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/tokens.js";

const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/auth",
  maxAge: 60 * 60 * 24 * 7, // 7 days, keep in sync with JWT_REFRESH_TTL
};

async function issueSession(fastify, reply, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await fastify.prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: await argon2.hash(refreshToken) },
  });

  reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
  return accessToken;
}

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

    const accessToken = await issueSession(fastify, reply, user);
    const permissions = await loadPermissionCodes(fastify.prisma, user.roleId);

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, roleName: user.role.name },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        subdomain: user.tenant.subdomain,
        primaryColor: user.tenant.primaryColor,
        logoUrl: user.tenant.logoUrl,
      },
      permissions,
    };
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) return reply.code(401).send({ error: "No refresh token" });

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, tenant: true },
    });

    if (!user || !user.isActive || !user.refreshTokenHash || !(await argon2.verify(user.refreshTokenHash, token))) {
      reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
      return reply.code(401).send({ error: "Refresh token no longer valid" });
    }

    const accessToken = await issueSession(fastify, reply, user); // rotates the refresh token
    const permissions = await loadPermissionCodes(fastify.prisma, user.roleId);

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, roleName: user.role.name },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        subdomain: user.tenant.subdomain,
        primaryColor: user.tenant.primaryColor,
        logoUrl: user.tenant.logoUrl,
      },
      permissions,
    };
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await fastify.prisma.user.update({
          where: { id: payload.sub },
          data: { refreshTokenHash: null },
        }).catch(() => {});
      } catch {
        // token already invalid/expired — nothing to revoke
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
    return { ok: true };
  });

  fastify.get("/me", { preHandler: fastify.authenticate }, async (request) => {
    return {
      user: { id: request.user.id, name: request.user.name, email: request.user.email },
      tenantId: request.user.tenantId,
      permissions: [...request.user.permissions],
    };
  });
}
