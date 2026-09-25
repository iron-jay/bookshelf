"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { burnVerificationTime, verifyPassword } from "@/lib/auth/password";
import { createSession, generateSessionToken, setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter a username and password." };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username));

  // Same message and roughly the same cost either way, so a wrong username and
  // a wrong password cannot be told apart.
  if (!user) {
    await burnVerificationTime(password);
    return { error: "Username or password is incorrect." };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "Username or password is incorrect." };
  }

  const token = generateSessionToken();
  await createSession(token, user.id);
  await setSessionCookie(token);

  redirect("/");
}
