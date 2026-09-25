import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Whether the database is answering.
 *
 * Deliberately unauthenticated, because it cannot be anything else: sessions
 * live in the database, so a check that required one would fail for the very
 * reason it exists to report. It says nothing beyond up or down — no version,
 * no connection string, no error text.
 *
 * The error page asks this, and a container healthcheck or an uptime monitor
 * can too.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ database: true });
  } catch {
    // 503 rather than 500: the app is fine, the thing behind it is not, and a
    // monitor should read that as "come back shortly".
    return Response.json({ database: false }, { status: 503 });
  }
}
