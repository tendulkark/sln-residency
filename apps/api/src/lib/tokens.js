import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "#src/config/env.js";

// Both tokens carry `sid`, the UserSession (signed-in device) they belong
// to — see lib/sessions.js.
export function signAccessToken(user, sid) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, roleId: user.roleId, sid, type: "access" },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessTtl }
  );
}

export function signRefreshToken(user, sid) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, sid, type: "refresh" },
    env.jwtRefreshSecret,
    // A random jti makes every rotation a distinct token — without it, two
    // signed in the same second are byte-identical and rotation is a no-op.
    { expiresIn: env.jwtRefreshTtl, jwtid: randomUUID() }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
