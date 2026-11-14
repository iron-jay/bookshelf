import { eq } from "drizzle-orm";

import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { editionCount, inspectEditionRemoval, inspectWorkRemoval } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { editions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * What Delete on this edition would take, as the web's confirmation page says
 * it: `work` for the whole book, and `edition` for just this one, null when it
 * is the book's only edition (which goes only with the book).
 */
export const GET = withUser<{ id: string }>(async (_request, { params }) => {
  const id = uuidParam((await params).id, "edition");
  const [edition] = await db.select({ workId: editions.workId }).from(editions).where(eq(editions.id, id));
  if (!edition) throw new ApiError("not_found", "No such edition.");
  const [work, only, total] = await Promise.all([
    inspectWorkRemoval(edition.workId),
    inspectEditionRemoval(id),
    editionCount(edition.workId),
  ]);
  return json({ work, edition: total > 1 ? only : null });
});
