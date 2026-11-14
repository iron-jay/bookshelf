import { and, eq, ne } from "drizzle-orm";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateOtherSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Settings → Account, shared by its server actions and the phone's `/me`
 * routes, so both apply the same rules and say the same things.
 */

export type AccountResult = { ok: boolean; message: string };

/** Letters, digits and the punctuation people actually put in usernames. */
const USERNAME = /^[a-zA-Z0-9._-]{2,32}$/;

/** Short enough not to be annoying on a private server, long enough to mean something. */
const MIN_PASSWORD = 8;

/**
 * Rename the account. ADMIN_USERNAME only ever named it at creation, so this is
 * the thing that decides what it is called from then on — including for the
 * no-sign-in path, which falls back to the oldest account when the environment
 * variable no longer matches anybody.
 */
export async function renameAccount(userId: string, typedUsername: string, typedDisplayName: string): Promise<AccountResult> {
  const username = typedUsername.trim();
  const displayName = typedDisplayName.trim();
  if (!USERNAME.test(username)) {
    return { ok: false, message: "Two to thirty-two characters: letters, digits, dot, dash or underscore." };
  }
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, userId)));
  if (clash) return { ok: false, message: "Somebody already has that name." };

  // Sessions key on the user id, so renaming does not sign anybody out.
  await db
    .update(users)
    .set({ username, displayName: displayName || null })
    .where(eq(users.id, userId));
  return { ok: true, message: "Saved." };
}

/**
 * `keepToken` is the session asking (the page's cookie or the phone's
 * token): every other one was authorised by the old password and is ended.
 */
export async function changeAccountPassword(
  userId: string,
  given: { current: string; next: string; confirm: string },
  keepToken: string | undefined,
): Promise<AccountResult> {
  if (given.next.length < MIN_PASSWORD) return { ok: false, message: `At least ${MIN_PASSWORD} characters.` };
  if (given.next !== given.confirm) return { ok: false, message: "The two new passwords do not match." };

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!row || !(await verifyPassword(row.passwordHash, given.current))) {
    return { ok: false, message: "That is not the current password." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(given.next) })
    .where(eq(users.id, userId));
  if (keepToken) await invalidateOtherSessions(userId, keepToken);
  return { ok: true, message: "Password changed. Any other signed-in device has been signed out." };
}
