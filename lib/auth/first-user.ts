import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { users } from "@/lib/db/schema";

import { hashPassword } from "./password";

export type FirstUserResult =
  | { kind: "exists"; username: string }
  | { kind: "created"; username: string }
  | { kind: "missing-password" };

/**
 * Creates the first user from ADMIN_USERNAME / ADMIN_PASSWORD when there is
 * nobody at all, and otherwise does nothing.
 *
 * Deliberately "is there anybody", not "is there someone called
 * ADMIN_USERNAME": renaming the account in Settings must not cause the next
 * start to quietly create a second one. gameshelf had the two rules in two
 * scripts, and its seed script got it wrong; here both the image's migrate step
 * and `npm run db:seed` call this.
 *
 * Takes its own connection rather than the app's pool, because both callers run
 * outside Next and close the connection when they are done.
 */
export async function ensureFirstUser(db: PostgresJsDatabase): Promise<FirstUserResult> {
  const [existing] = await db.select({ username: users.username }).from(users).limit(1);
  if (existing) return { kind: "exists", username: existing.username };

  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { kind: "missing-password" };

  await db.insert(users).values({
    username,
    displayName: username,
    passwordHash: await hashPassword(password),
    isAdmin: true,
  });

  return { kind: "created", username };
}

export function describeFirstUser(result: FirstUserResult): string {
  switch (result.kind) {
    case "exists":
      return `[user] ${result.username} already exists, left alone`;
    case "created":
      return `[user] created ${result.username}`;
    case "missing-password":
      return "[user] ADMIN_PASSWORD must be set to create the first user";
  }
}
