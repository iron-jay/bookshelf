"use server";

import { redirect } from "next/navigation";

import { checkCredentials } from "@/lib/auth/login";
import { createSession, generateSessionToken, setSessionCookie } from "@/lib/auth/session";
import { describeWait } from "@/lib/auth/throttle";

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter a username and password." };
  }

  const result = await checkCredentials(username, password);
  if (!result.ok) {
    return {
      error:
        result.reason === "throttled"
          ? describeWait(result.retryAfterSeconds)
          : "Username or password is incorrect.",
    };
  }

  const token = generateSessionToken();
  await createSession(token, result.userId);
  await setSessionCookie(token);

  redirect("/");
}
