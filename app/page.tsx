import { count } from "drizzle-orm";

import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// A stand-in until the shelf exists (build step 5). It queries on purpose, so
// loading the home page proves the app, the pool and the migrated schema agree.
export default async function Home() {
  const [row] = await db.select({ n: count() }).from(works);

  return (
    <main className="flex-1 p-6">
      <h1 className="text-xl font-medium">bookshelf</h1>
      <p className="font-narrow text-ink-dim">
        {row.n === 1 ? "1 work" : `${row.n} works`} in the catalogue.
      </p>
    </main>
  );
}
