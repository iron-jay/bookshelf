import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

// Next's dev server re-evaluates modules on every hot reload. Without pinning
// the client to globalThis each reload opens another pool and Postgres starts
// refusing connections after a few dozen edits.
const globalForDb = globalThis as unknown as {
  conn?: ReturnType<typeof postgres>;
  db?: Database;
};

function connect(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const conn = globalForDb.conn ?? postgres(connectionString);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.conn = conn;
  }

  return drizzle(conn, { schema });
}

/**
 * Connects on first use rather than on import.
 *
 * `next build` imports every page module to collect its metadata, and the image
 * is built without a database or a .env — so connecting at module scope failed
 * the build on a page that would never have run a query anyway. A build should
 * not need a database.
 *
 * The proxy exists so the several dozen `db.select(...)` call sites stay as they
 * are; swapping them all for `getDb()` would be a worse trade.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    globalForDb.db ??= connect();
    return Reflect.get(globalForDb.db, property, receiver);
  },
});

export { schema };
