"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, invalidateSession, readSessionToken } from "@/lib/auth/session";

export async function logout(): Promise<void> {
  const token = await readSessionToken();

  // Delete the row as well as the cookie: a token that survives in the database
  // is still a valid credential for anyone who copied it.
  if (token) {
    await invalidateSession(token);
  }

  await clearSessionCookie();
  redirect("/login");
}
