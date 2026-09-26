import fp from "fastify-plugin";
import { verifyAccessToken } from "#src/lib/tokens.js";
import { permissionCodesForRole } from "#src/lib/permissions.js";

// Decorates the request with `authenticate`, a preHandler that verifies the
// bearer access token and loads the caller's tenant/role/permissions onto
// `request.user`. Every protected route uses this — there is no "trust the
// client" path.
export default fp(async function authPlugin(fastify) {
  fastify.decorate("authenticate", async function authenticate(request, reply) {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing bearer token" });
    }

    let payload;
    try {
      payload = verifyAccessToken(header.slice("Bearer ".length));
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }

    // The token must still belong to a live signed-in device — signing a
    // device out (Profile screen, or an Admin resetting the password)
    // deletes its UserSession row, which locks this token out immediately.
    const session = payload.sid
      ? await fastify.prisma.userSession.findUnique({
          where: { id: payload.sid },
          include: { user: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
        })
      : null;
    const user = session?.user;

    if (!session || session.expiresAt < new Date() || session.userId !== payload.sub) {
      return reply.code(401).send({ error: "Signed out on this device" });
    }
    if (!user.isActive || user.tenantId !== payload.tenantId) {
      return reply.code(401).send({ error: "User no longer valid" });
    }

    request.user = {
      id: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      name: user.name,
      email: user.email,
      roleName: user.role.name,
      sessionId: session.id,
      permissions: new Set(permissionCodesForRole(user.role)),
    };
  });
});
