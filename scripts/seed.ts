/**
 * Creates the first user in development, where migrations run through
 * drizzle-kit rather than scripts/migrate.ts and so nothing else would.
 *
 *     npm run db:seed
 *
 * Same rule as the image's start-up step: does nothing if any user exists, and
 * never resets an existing password.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { describeFirstUser, ensureFirstUser } from "@/lib/auth/first-user";

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    return 1;
  }

  const sql = postgres(url, { max: 1 });
  try {
    const result = await ensureFirstUser(drizzle(sql));
    const line = describeFirstUser(result);
    if (result.kind === "missing-password") {
      console.error(line);
      return 1;
    }
    console.log(line);
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
