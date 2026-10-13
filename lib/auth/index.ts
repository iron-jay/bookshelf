import { cache } from "react";

import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import {
  readBearerToken,
  readSessionToken,
  validateSessionToken,
  type SessionUser,
} from "./session";

/**
 * Turns off sign-in entirely, for a single-user server on a network you trust.
 *
 * Everything the app can do becomes available to anything that can reach the
 * port — reading, rating, editing and deleting — so it is only sensible while
 * that port is genuinely private. It is deliberately a whole-app switch rather
 * than a per-route one: half-authenticated is a worse place to be than either
 * end.
 */
export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

/**
 * Who you are when there is no sign-in. ADMIN_USERNAME when it matches someone,
 * otherwise the oldest account — which on a single-user install is the only one.
 */
async function assumedUser(): Promise<SessionUser | null> {
  const columns = {
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    isAdmin: users.isAdmin,
  };

  const username = process.env.ADMIN_USERNAME?.trim();

  if (username) {
    const [named] = await db.select(columns).from(users).where(eq(users.username, username));
    if (named) return named;
  }

  // ADMIN_USERNAME only ever names the account at creation time, and it can be
  // renamed in settings afterwards. Falling back to the oldest account means a
  // rename does not lock you out of your own server.
  const [oldest] = await db.select(columns).from(users).orderBy(asc(users.createdAt)).limit(1);
  return oldest ?? null;
}

/**
 * Deduplicated per request: a layout and the page inside it both asking who is
 * logged in should cost one round trip, not two.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (authDisabled()) {
    return assumedUser();
  }

  const cookie = await readSessionToken();
  if (cookie) {
    const user = await validateSessionToken(cookie, "cookie");
    if (user) return user;
  }

  // The phone app's token. Checked here rather than only in the API routes so
  // that covers and the export, which already ask this function, work for the
  // phone without changes of their own.
  const bearer = await readBearerToken();
  return bearer ? validateSessionToken(bearer, "device") : null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type { SessionUser };
