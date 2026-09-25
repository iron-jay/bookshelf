import { createHash, randomBytes } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

// Cookies are scoped by host, not port, so on one box gameshelf and bookshelf
// would overwrite each other's session under a shared name.
export const SESSION_COOKIE = "bookshelf_session";

const TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RENEW_WITHIN_MS = TTL_MS / 2;

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

export async function createSession(token: string, userId: string): Promise<void> {
  await db.insert(sessions).values({
    id: digest(token),
    userId,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
}

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const id = digest(token);

  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Sliding expiry, but only written once past the halfway mark: a session in
  // daily use should never expire underneath you, and this avoids turning every
  // page view into a write.
  if (row.expiresAt.getTime() - Date.now() < RENEW_WITHIN_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + TTL_MS) })
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

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The app serves plain HTTP behind the reverse proxy, so the connection it
    // sees is never the one the browser made. ORIGIN is what knows about TLS.
    secure: process.env.ORIGIN?.startsWith("https://") ?? false,
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
