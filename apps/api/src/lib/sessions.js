import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { signAccessToken, signRefreshToken } from "#src/lib/tokens.js";

// A signed-in device (UserSession row) — see the model's comment in
// schema.prisma. Everything that creates, rotates, or ends one lives here so
// auth.routes.js, users.routes.js and the authenticate plugin agree on it.

export const REFRESH_COOKIE = "refreshToken";
export const REFRESH_COOKIE_PATH = "/auth";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: REFRESH_COOKIE_PATH,
  maxAge: 60 * 60 * 24 * 7, // 7 days, keep in sync with JWT_REFRESH_TTL
};

// How long the just-replaced refresh token still works after a rotation —
// long enough for a second tab's in-flight refresh (sent with the old
// cookie) to land, short enough that a stolen old token is useless.
const ROTATION_GRACE_MS = 30_000;

// Oldest-used devices beyond this are signed out when a new one signs in,
// so a user who never presses "Sign out" doesn't pile up sessions forever.
const MAX_SESSIONS_PER_USER = 10;

// Refresh tokens are long random JWTs, not guessable passwords — a fast
// hash is the right tool (argon2 is for low-entropy secrets).
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function expiryOf(token) {
  return new Date(jwt.decode(token).exp * 1000);
}

function deviceInfo(request) {
  return {
    userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
    ipAddress: request.ip ?? null,
  };
}

// The signed-in user/tenant/permissions shape the web app keeps in its
// auth store — returned by login, refresh and /me alike so all three can
// be applied the same way.
export function sessionPayload(user, permissions) {
  return {
    user: { id: user.id, name: user.name, email: user.email, roleId: user.roleId, roleName: user.role.name },
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      subdomain: user.tenant.subdomain,
      primaryColor: user.tenant.primaryColor,
      logoUrl: user.tenant.logoUrl,
    },
    permissions,
  };
}

// Signs a new device in: a fresh UserSession row, its refresh cookie, and
// the first access token. Also sweeps this user's expired rows and trims
// the oldest ones past MAX_SESSIONS_PER_USER.
export async function startSession(prisma, request, reply, user) {
  const sid = randomUUID();
  const refreshToken = signRefreshToken(user, sid);

  await prisma.userSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await prisma.userSession.create({
    data: {
      id: sid,
      tenantId: user.tenantId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: expiryOf(refreshToken),
      ...deviceInfo(request),
    },
  });

  const surplus = await prisma.userSession.findMany({
    where: { userId: user.id },
    orderBy: { lastUsedAt: "desc" },
    skip: MAX_SESSIONS_PER_USER,
    select: { id: true },
  });
  if (surplus.length) {
    await prisma.userSession.deleteMany({ where: { id: { in: surplus.map((s) => s.id) } } });
  }

  reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
  return signAccessToken(user, sid);
}

// Exchanges a device's refresh token for a new access token, rotating the
// refresh token. Returns the access token, or null if the session is gone,
// expired, or the token presented is a replay (which also ends the session).
export async function renewSession(prisma, request, reply, session, presentedToken) {
  const presented = hashToken(presentedToken);
  const now = new Date();

  if (sameHash(presented, session.refreshTokenHash)) {
    const refreshToken = signRefreshToken(session.user, session.id);
    // Conditional on the hash we just read, so two tabs refreshing in the
    // same instant can't both rotate (the loser's token would then match
    // neither slot and look like a replay). The loser falls through to the
    // same no-rotate answer as the grace path below.
    const { count } = await prisma.userSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash },
      data: {
        refreshTokenHash: hashToken(refreshToken),
        previousTokenHash: session.refreshTokenHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: expiryOf(refreshToken),
        ...deviceInfo(request),
      },
    });
    if (count === 1) reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return signAccessToken(session.user, session.id);
  }

  // Another tab of this same browser rotated a moment ago; the browser's
  // cookie jar already holds the newer token, so just hand back an access
  // token without rotating (or touching the cookie) again.
  if (sameHash(presented, session.previousTokenHash) && now - session.rotatedAt < ROTATION_GRACE_MS) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
    return signAccessToken(session.user, session.id);
  }

  await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
  return null;
}

export function clearRefreshCookie(reply) {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

// Signs every device of this user out — an Admin reset their password or
// deactivated them, so no existing sign-in should outlive that.
export async function endAllSessions(prisma, userId) {
  await prisma.userSession.deleteMany({ where: { userId } });
}
