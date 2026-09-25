"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateOtherSessions, readSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type AccountState = { ok: boolean; message: string } | null;

/** Letters, digits and the punctuation people actually put in usernames. */
const USERNAME = /^[a-zA-Z0-9._-]{2,32}$/;

/**
 * Rename the account. ADMIN_USERNAME only ever named it at creation, so this is
 * the thing that decides what it is called from then on — including for the
 * no-sign-in path, which falls back to the oldest account when the environment
 * variable no longer matches anybody.
 */
export async function updateAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!USERNAME.test(username)) {
    return {
      ok: false,
      message: "Two to thirty-two characters: letters, digits, dot, dash or underscore.",
    };
  }

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, user.id)));

  if (clash) {
    return { ok: false, message: "Somebody already has that name." };
  }

  await db
    .update(users)
    .set({ username, displayName: displayName || null })
    .where(eq(users.id, user.id));

  // Sessions key on the user id, so renaming does not sign anybody out.
  revalidatePath("/settings");
  revalidatePath("/");

  return { ok: true, message: "Saved." };
}

export type PasswordState = { ok: boolean; message: string } | null;

/** Short enough not to be annoying on a private server, long enough to mean something. */
const MIN_PASSWORD = 8;

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < MIN_PASSWORD) {
    return { ok: false, message: `At least ${MIN_PASSWORD} characters.` };
  }
  if (next !== confirm) {
    return { ok: false, message: "The two new passwords do not match." };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id));

  if (!row || !(await verifyPassword(row.passwordHash, current))) {
    return { ok: false, message: "That is not the current password." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));

  // Other devices holding a session were authorised by the old password.
  const token = await readSessionToken();
  if (token) {
    await invalidateOtherSessions(user.id, token);
  }

  return { ok: true, message: "Password changed. Any other signed-in device has been signed out." };
}
