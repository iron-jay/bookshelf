import { eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { findBook } from "@/lib/hardcover";

import { setCover } from "./covers";
import { setWorkSeries } from "./series";

export type FillResult = { result: "filled"; added: string[] } | { result: "none" } | { result: "skipped" };

/**
 * Fills in one local work from Hardcover — the manual run in Settings, for
 * books that arrived before a token was set. Only empty fields are filled:
 * a description, year, series or cover already there, from the import or
 * typed by hand, is never replaced — with one exception. A cover still
 * waiting for review (Google's first hit for the title, never confirmed) gives
 * way to a strict Hardcover match: nobody approved it, and the match is better
 * evidence than a first hit. Anything approved, uploaded or picked stays. The Hardcover id is recorded, so the work
 * is not looked up again; a miss records nothing and is simply tried next run.
 */
export async function fillFromHardcover(workId: string, userId: string): Promise<FillResult> {
  const [work] = await db
    .select({
      title: works.title,
      authors: works.authors,
      source: works.source,
      hardcoverId: works.hardcoverId,
      summary: works.summary,
      year: works.firstPublishedYear,
      seriesId: works.seriesId,
      coverUrl: works.coverUrl,
      coverNeedsReview: works.coverNeedsReview,
    })
    .from(works)
    .where(eq(works.id, workId));
  if (!work || work.source !== "local" || work.hardcoverId !== null) return { result: "skipped" };

  const book = await findBook(work.title, work.authors);
  if (!book) return { result: "none" };

  const added: string[] = [];
  await db.transaction(async (tx) => {
    await tx
      .update(works)
      .set({
        hardcoverId: book.id,
        ...(work.summary === null && book.description ? { summary: book.description } : {}),
        ...(work.year === null && book.releaseYear ? { firstPublishedYear: book.releaseYear } : {}),
      })
      .where(eq(works.id, workId));
    if (work.summary === null && book.description) added.push("description");
    if (work.year === null && book.releaseYear) added.push("year");
    if (work.seriesId === null && book.series) {
      await setWorkSeries(tx, workId, book.series.name, book.series.position, userId);
      added.push("series");
    }
  });

  // After the transaction: a download is network I/O, and a failed one must
  // not undo the details above.
  if ((work.coverUrl === null || work.coverNeedsReview) && book.imageUrl) {
    const stored = await downloadCover(book.imageUrl);
    if (stored.ok) {
      await setCover({ kind: "work", id: workId }, stored.path, "hardcover", false);
      added.push("cover");
    }
  }

  return { result: "filled", added };
}
