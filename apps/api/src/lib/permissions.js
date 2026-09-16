// Route-level permission gate. Usage in a route:
//   fastify.get("/rooms", { preHandler: [fastify.authenticate, requirePermission("rooms.view")] }, handler)
//
// This is the backend enforcement point — the frontend also hides
// buttons/menus for permissions the user lacks, but that is a UX nicety
// only. This check is the real security boundary (AI_RULES.md #3).
export function requirePermission(code) {
  return async function permissionGate(request, reply) {
    if (!request.user?.permissions?.has(code)) {
      return reply.code(403).send({ error: `Missing permission: ${code}` });
    }
  };
}
