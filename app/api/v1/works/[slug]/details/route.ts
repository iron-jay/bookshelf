import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { formFrom, saveWorkDetails, WORK_FIELDS, workValues } from "@/lib/books/edit-details";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function workBySlug(slug: string) {
  const [work] = await db.select().from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such work.");
  return work;
}

/**
 * The book's details as `/work/{slug}/edit` shows them: `{ title, subtitle,
 * authors, authorSort, year, summary }`, each a string as the form has it
 * (authors comma-separated, blank for nothing).
 */
export const GET = withUser<{ slug: string }>(async (_request, { params }) => {
  return json(workValues(await workBySlug((await params).slug)));
});

/**
 * Saves those fields, read by the edit page's own rules (blank author sort is
 * worked out from the first author). A refusal is `invalid` with the page's
 * message. Answers with the fields as saved.
 */
export const PUT = withUser<{ slug: string }>(async (request, { params }) => {
  const work = await workBySlug((await params).slug);
  const result = await saveWorkDetails(work.id, formFrom(await readObject(request), WORK_FIELDS));
  if (!result.ok) throw new ApiError("invalid", result.error);
  revalidatePath("/", "layout");
  return json(workValues(await workBySlug(work.slug)));
});
