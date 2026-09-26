import { PERMISSION_CODES } from "@sln/shared-schemas";

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

// Same gate for a route more than one screen reads — passes if the caller
// holds any one of `codes`.
export function requireAnyPermission(...codes) {
  return async function anyPermissionGate(request, reply) {
    if (!codes.some((code) => request.user?.permissions?.has(code))) {
      return reply.code(403).send({ error: `Missing permission: one of ${codes.join(", ")}` });
    }
  };
}

// What a role may do. The tenant's built-in Admin role (isSystemRole) always
// holds the whole permission catalog — including any permission added in a
// later release — and can't be edited, so no change in Roles & Permissions
// can ever strand a hotel without someone able to manage staff and roles.
// Every other role is exactly its RolePermission rows.
export function permissionCodesForRole(role) {
  if (role.isSystemRole) return [...PERMISSION_CODES];
  return role.rolePermissions.map((rp) => rp.permission.code);
}
