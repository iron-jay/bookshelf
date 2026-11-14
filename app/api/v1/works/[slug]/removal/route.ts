import { eq } from "drizzle-orm";

import { ApiError, json, withUser } from "@/lib/api";
import { inspectWorkRemoval } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** What deleting the book would take with it, for the phone's confirmation. */
export const GET = withUser<{ slug: string }>(async (_request, { params }) => {
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, (await params).slug));
  if (!work) throw new ApiError("not_found", "No such work.");
  return json({ work: await inspectWorkRemoval(work.id) });
});
