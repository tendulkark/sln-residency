import fp from "fastify-plugin";
import { verifyAccessToken } from "#src/lib/tokens.js";

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

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      return reply.code(401).send({ error: "User no longer valid" });
    }

    request.user = {
      id: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      name: user.name,
      email: user.email,
      permissions: new Set(user.role.rolePermissions.map((rp) => rp.permission.code)),
    };
  });
});
