import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, roleId: user.roleId, type: "access" },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessTtl }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, type: "refresh" },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
