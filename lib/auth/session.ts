import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

// Cookies are scoped by host, not port, so on one box gameshelf and bookshelf
// would overwrite each other's session under a shared name.
export const SESSION_COOKIE = "bookshelf_session";

const DAY_MS = 1000 * 60 * 60 * 24;
/**
 * A browser cookie and a phone's token are the same thing stored the same way;
 * only how they travel differs. Keeping the two apart means a cookie lifted out
 * of a browser is not also a bearer token, and the reverse.
 */
export type SessionKind = "cookie" | "device";

/**
 * A phone you open once a month should not sign you out between uses, so a
 * device lasts six months against a browser's one. Both slide.
 */
const TTL_BY_KIND: Readonly<Record<SessionKind, number>> = {
  cookie: 30 * DAY_MS,
  device: 180 * DAY_MS,
};

/**
 * "Last used" only has to be good enough to recognise a device you no longer
 * have, so it is written at most hourly rather than on every request.
 */
const TOUCH_EVERY_MS = 1000 * 60 * 60;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The cookie carries the token; the database stores only its digest. A dump of
 * the sessions table is then a list of hashes rather than a set of usable
 * logins.
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  token: string,
  userId: string,
  options: { kind?: SessionKind; label?: string | null } = {},
): Promise<void> {
  const kind = options.kind ?? "cookie";
  await db.insert(sessions).values({
    id: digest(token),
    userId,
    kind,
    label: options.label ?? null,
    expiresAt: new Date(Date.now() + TTL_BY_KIND[kind]),
    lastUsedAt: new Date(),
  });
}

export async function validateSessionToken(
  token: string,
  kind: SessionKind = "cookie",
): Promise<SessionUser | null> {
  const id = digest(token);

  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), eq(sessions.kind, kind)));

  if (!row) return null;

  const now = Date.now();

  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Sliding expiry, but only written once past the halfway mark: a session in
  // daily use should never expire underneath you, and this avoids turning every
  // page view into a write. "Last used" rides along on the same rule, plus an
  // hourly touch so the devices list in Settings is roughly right.
  const ttl = TTL_BY_KIND[kind];
  const renew = row.expiresAt.getTime() - now < ttl / 2;
  const touch = !row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS;

  if (renew || touch) {
    await db
      .update(sessions)
      .set({
        lastUsedAt: new Date(now),
        ...(renew ? { expiresAt: new Date(now + ttl) } : {}),
      })
      .where(eq(sessions.id, id));
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
  };
}

/**
 * Ends every other session for this user, keeping the one making the request.
 * Signing other devices out is most of the point of changing a password.
 */
export async function invalidateOtherSessions(userId: string, keepToken: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, digest(keepToken))));
}

export async function invalidateSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, digest(token)));
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The token from `Authorization: Bearer <token>`, which is how the phone app sends it. */
export async function readBearerToken(): Promise<string | undefined> {
  const header = (await headers()).get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export type DeviceSession = {
  /** The stored digest. Safe to hand to the page: it cannot be turned back into a token. */
  id: string;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export async function listDeviceSessions(userId: string): Promise<DeviceSession[]> {
  return db
    .select({
      id: sessions.id,
      label: sessions.label,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.kind, "device")))
    .orderBy(desc(sessions.lastUsedAt));
}

/** Scoped to the user, so a digest from someone else's list does nothing. */
export async function revokeDeviceSession(userId: string, id: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), eq(sessions.kind, "device")));
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The app serves plain HTTP behind the reverse proxy, so the connection it
    // sees is never the one the browser made. ORIGIN is what knows about TLS.
    secure: process.env.ORIGIN?.startsWith("https://") ?? false,
    path: "/",
    maxAge: TTL_BY_KIND.cookie / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
