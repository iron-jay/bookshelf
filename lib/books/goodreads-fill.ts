import { and, eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, entryCards, works } from "@/lib/db/schema";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

import { setCover } from "./covers";
import { parsePosition, setWorkSeries } from "./series";

/**
 * Goodreads' covers come from Amazon's image servers (or Goodreads' older
 * ones). Only those are downloaded, so the bookmarklet cannot be made to point
 * the server anywhere else.
 */
const COVER_HOSTS = /^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|i\.gr-assets\.com|s\.gr-assets\.com)\//;

/** What the bookmarklet sent, checked as untrusted input: shape, sizes, hosts. */
export function checkPageData(value: unknown): GoodreadsPageData | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  const id = Number(v.goodreadsId);
  if (!Number.isInteger(id) || id <= 0 || id > 10_000_000_000) return null;
  const cover = str(v.coverUrl, 1000);
  const year = Number(v.year);
  return {
    goodreadsId: id,
    title: str(v.title, 500),
    description: str(v.description, 20_000),
    coverUrl: cover && COVER_HOSTS.test(cover) ? cover : null,
    series: str(v.series, 200),
    position: str(v.position, 20),
    year: Number.isInteger(year) && year > 0 && year < 3000 ? year : null,
  };
}

export type GoodreadsTarget = {
  editionId: string;
  editionName: string;
  workId: string;
  workTitle: string;
  missing: { description: boolean; year: boolean; series: boolean; cover: boolean };
  coverNeedsReview: boolean;
};

/**
 * Your edition with that Goodreads id — the import stored it on every book it
 * brought in. What is empty is worked out from what the shelf shows, so a
 * cover inherited from the work counts as a cover.
 */
export async function findGoodreadsTarget(userId: string, goodreadsId: number): Promise<GoodreadsTarget | null> {
  const [row] = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      workId: works.id,
      workTitle: works.title,
      summary: works.summary,
      year: works.firstPublishedYear,
      seriesId: works.seriesId,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(eq(editions.goodreadsBookId, goodreadsId))
    .limit(1);
  if (!row) return null;

  const [card] = await db
    .select({ coverUrl: entryCards.coverUrl, review: entryCards.coverNeedsReview })
    .from(entryCards)
    .where(and(eq(entryCards.editionId, row.editionId), eq(entryCards.userId, userId)));

  return {
    editionId: row.editionId,
    editionName: row.editionName,
    workId: row.workId,
    workTitle: row.workTitle,
    missing: {
      description: row.summary === null,
      year: row.year === null,
      series: row.seriesId === null,
      cover: !card?.coverUrl,
    },
    coverNeedsReview: Boolean(card?.review),
  };
}

/**
 * Fills the empty fields from the page: description, year and series on the
 * work; the cover on the edition, since a Goodreads id names one edition and
 * its art is that edition's. The cover is replaced only when there is none,
 * it is waiting for review, or the person ticked "replace".
 */
export async function applyGoodreadsFill(
  userId: string,
  data: GoodreadsPageData,
  replaceCover: boolean,
): Promise<{ target: GoodreadsTarget; filled: string[] } | { error: string }> {
  const target = await findGoodreadsTarget(userId, data.goodreadsId);
  if (!target) return { error: "No book on your shelf has that Goodreads id." };

  const filled: string[] = [];
  const position = data.position ? parsePosition(data.position) : null;
  await db.transaction(async (tx) => {
    const set: Partial<typeof works.$inferInsert> = {};
    if (target.missing.description && data.description) {
      set.summary = data.description;
      filled.push("description");
    }
    if (target.missing.year && data.year) {
      set.firstPublishedYear = data.year;
      filled.push("year");
    }
    if (Object.keys(set).length) await tx.update(works).set(set).where(eq(works.id, target.workId));
    if (target.missing.series && data.series) {
      // "1-3" or "0.5a" is not a position; the series is still worth having.
      await setWorkSeries(tx, target.workId, data.series, position === "invalid" ? null : position, userId);
      filled.push("series");
    }
  });

  if (data.coverUrl && (target.missing.cover || target.coverNeedsReview || replaceCover)) {
    const stored = await downloadCover(data.coverUrl);
    if (stored.ok) {
      await setCover({ kind: "edition", id: target.editionId }, stored.path, "url", false);
      filled.push("cover");
    }
  }
  return { target, filled };
}
