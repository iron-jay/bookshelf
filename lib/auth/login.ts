import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { burnVerificationTime, verifyPassword } from "./password";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "./throttle";

export type CredentialCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "incorrect" }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/**
 * The one place a password is checked at sign-in, for the web form and the
 * phone's token request alike, so both get the same timing and the same limit.
 */
export async function checkCredentials(username: string, password: string): Promise<CredentialCheck> {
  const blocked = await loginBlockedFor(username);
  if (blocked !== null) {
    return { ok: false, reason: "throttled", retryAfterSeconds: blocked };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username));

  // Same answer and roughly the same cost either way, so a wrong username and
  // a wrong password cannot be told apart.
  if (!user) {
    await burnVerificationTime(password);
    await recordLoginFailure(username);
    return { ok: false, reason: "incorrect" };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordLoginFailure(username);
    return { ok: false, reason: "incorrect" };
  }

  clearLoginFailures(username);
  return { ok: true, userId: user.id };
}
