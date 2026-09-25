/**
 * Applies migrations and exits.
 *
 * Bundled by esbuild into the app image and run before the server starts, so
 * one image does both jobs. It cannot simply import what it needs at runtime:
 * Next's standalone output only contains what the app itself imports, and
 * `drizzle-orm/postgres-js/migrator` is not among them. esbuild inlines it.
 *
 * Seeding the first user joins this in step 2, as it does in gameshelf.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
