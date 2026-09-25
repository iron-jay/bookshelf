/**
 * Applies migrations, makes sure there is a user, and exits.
 *
 * Bundled by esbuild into the app image and run before the server starts, so
 * one image does both jobs. It cannot simply import what it needs at runtime:
 * Next's standalone output only contains what the app itself imports, and
 * `drizzle-orm/postgres-js/migrator` is not among them. esbuild inlines it.
 *
 * `@node-rs/argon2` stays external because it is a native module and cannot be
 * bundled — it is already in the standalone output, since login uses it.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { describeFirstUser, ensureFirstUser } from "../lib/auth/first-user";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// One connection, used briefly and closed. This is not the app's pool.
// Notices are silenced because re-running against an up-to-date database emits
// a "schema already exists, skipping" object for every statement, which buries
// the one line anybody actually wants to read in the deploy log.
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[migrations] up to date");

  const result = await ensureFirstUser(db);
  if (result.kind === "missing-password") {
    console.error(describeFirstUser(result));
    process.exit(1);
  }
  console.log(describeFirstUser(result));
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
