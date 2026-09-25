"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { authorSortFor } from "@/lib/authors";
import { parsePosition, setWorkSeries } from "@/lib/books/series";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

export type SeriesState = { error: string | null; saved: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Series are shared catalogue, like works: any account may file a work in
 * one. Typing an existing series' name joins it; a new name creates it; a
 * blank name takes the work out of whatever series it was in.
 */
export async function saveSeries(_prev: SeriesState, formData: FormData): Promise<SeriesState> {
  const user = await requireUser();
  const workId = text(formData, "workId");
  if (!isUuid(workId)) return { error: "That work is no longer here.", saved: false };

  const [work] = await db.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, workId));
  if (!work) return { error: "That work is no longer here.", saved: false };

  const name = text(formData, "series").slice(0, 200);
  const position = parsePosition(text(formData, "position"));
  if (position === "invalid") {
    return { error: "Position should be a number like 8 or 2.5.", saved: false };
  }

  await db.transaction((tx) => setWorkSeries(tx, work.id, name, name ? position : null, user.id));
  revalidatePath(`/work/${work.slug}`);
  revalidatePath("/");
  return { error: null, saved: true };
}

export type WorkState = { error: string | null; saved: boolean };

/**
 * The work's own details. The slug stays as it is, so links and bookmarks to
 * the work keep working after a title is corrected.
 */
export async function saveWork(_prev: WorkState, formData: FormData): Promise<WorkState> {
  await requireUser();
  const workId = text(formData, "workId");
  if (!isUuid(workId)) return { error: "That work is no longer here.", saved: false };
  const [work] = await db.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, workId));
  if (!work) return { error: "That work is no longer here.", saved: false };

  const title = text(formData, "title");
  if (!title) return { error: "A work needs a title.", saved: false };
  const authors = text(formData, "authors")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);

  const yearText = text(formData, "year");
  const year = yearText ? Number(yearText) : null;
  if (year !== null && (!Number.isInteger(year) || year < -3000 || year > 2100)) {
    return { error: "The year should be a whole number, like 1989.", saved: false };
  }

  // Not trimmed inside: paragraph breaks in a summary are deliberate.
  const rawSummary = formData.get("summary");
  const summary = typeof rawSummary === "string" && rawSummary.trim() ? rawSummary.trim() : null;
  if (summary && summary.length > 20_000) return { error: "That summary is too long to keep.", saved: false };

  await db
    .update(works)
    .set({
      title: title.slice(0, 500),
      subtitle: text(formData, "subtitle").slice(0, 500) || null,
      authors,
      // Blank means "work it out from the first author" — the same rule as on
      // add. Typed means someone knows better, as with pen names and
      // family-name-first names.
      authorSort: text(formData, "authorSort").slice(0, 200) || authorSortFor(authors[0]),
      firstPublishedYear: year,
      summary,
    })
    .where(eq(works.id, work.id));

  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
