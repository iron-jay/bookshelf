import { and, eq, ne, type SQL } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, entryCards, works } from "@/lib/db/schema";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

import { setCover } from "./covers";
import { parsePosition, setWorkSeries } from "./series";
import { fold } from "./titles";

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
  goodreadsBookId: number | null;
  missing: { description: boolean; year: boolean; series: boolean; cover: boolean };
  coverNeedsReview: boolean;
};

/**
 * One of your editions, with what is empty worked out from what the shelf
 * shows, so a cover inherited from the work counts as a cover. Never a fan
 * translation: every Goodreads cover is an official one (§4a).
 */
async function findTarget(userId: string, which: SQL): Promise<GoodreadsTarget | null> {
  const [row] = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      goodreadsBookId: editions.goodreadsBookId,
      workId: works.id,
      workTitle: works.title,
      summary: works.summary,
      year: works.firstPublishedYear,
      seriesId: works.seriesId,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(and(which, ne(editions.kind, "fan_translation")))
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
    goodreadsBookId: row.goodreadsBookId,
    missing: {
      description: row.summary === null,
      year: row.year === null,
      series: row.seriesId === null,
      cover: !card?.coverUrl,
    },
    coverNeedsReview: Boolean(card?.review),
  };
}

/** Your edition with that Goodreads id — the import stored it on every book it brought in. */
export function findGoodreadsTarget(userId: string, goodreadsId: number): Promise<GoodreadsTarget | null> {
  return findTarget(userId, eq(editions.goodreadsBookId, goodreadsId));
}

/** One of your editions by id, for a book picked by hand. */
export function findEditionTarget(userId: string, editionId: string): Promise<GoodreadsTarget | null> {
  if (!/^[0-9a-f-]{36}$/i.test(editionId)) return Promise.resolve(null);
  return findTarget(userId, eq(editions.id, editionId));
}

export type FillCandidate = {
  editionId: string;
  title: string;
  authors: string[];
  editionName: string;
  cover: "missing" | "review" | "ok";
};

/**
 * Books on your shelf to fill from a Goodreads page no edition is linked to:
 * those missing a cover (or with one to review) first, then the rest, each
 * group with titles most like the page's at the top. The page shows the first
 * group and expands to the rest on request.
 */
export async function listFillCandidates(userId: string, goodreadsTitle: string | null): Promise<FillCandidate[]> {
  const rows = await db
    .select({
      editionId: entryCards.editionId,
      title: entryCards.workTitle,
      authors: entryCards.authors,
      editionName: entryCards.editionName,
      coverUrl: entryCards.coverUrl,
      review: entryCards.coverNeedsReview,
    })
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), eq(entryCards.isCommunityEdition, false)));

  // Goodreads' title carries the series in brackets; the words before it are
  // the ones worth comparing.
  const wanted = new Set(fold((goodreadsTitle ?? "").replace(/\s*\([^)]*#[^)]*\)\s*$/, "")).split(" ").filter(Boolean));
  const likeness = (title: string) => {
    if (!wanted.size) return 0;
    const own = fold(title).split(" ").filter(Boolean);
    return own.filter((w) => wanted.has(w)).length / Math.max(wanted.size, own.length);
  };

  const candidates: FillCandidate[] = rows.map((r) => ({
    editionId: r.editionId!,
    title: r.title ?? "",
    authors: r.authors ?? [],
    editionName: r.editionName ?? "",
    cover: !r.coverUrl ? "missing" : r.review ? "review" : "ok",
  }));
  const score = new Map(candidates.map((c) => [c.editionId, likeness(c.title)]));
  return candidates.sort(
    (a, b) =>
      Number(a.cover === "ok") - Number(b.cover === "ok") ||
      score.get(b.editionId)! - score.get(a.editionId)! ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Fills the empty fields from the page: description, year and series on the
 * work; the cover on the edition, since a Goodreads id names one edition and
 * its art is that edition's. The cover is replaced only when there is none,
 * it is waiting for review, or the person ticked "replace".
 *
 * `editionId` is the book the person picked when no edition had the page's
 * Goodreads id. That edition is linked to it, if it has no Goodreads id of its
 * own and no other book of theirs has this one, so the next click finds it —
 * and a later import of the same CSV row resumes onto it instead of adding a
 * second copy.
 */
export async function applyGoodreadsFill(
  userId: string,
  data: GoodreadsPageData,
  replaceCover: boolean,
  editionId?: string,
): Promise<{ target: GoodreadsTarget; filled: string[] } | { error: string }> {
  const target = editionId
    ? await findEditionTarget(userId, editionId)
    : await findGoodreadsTarget(userId, data.goodreadsId);
  if (!target) return { error: editionId ? "That book is not on your shelf." : "No book on your shelf has that Goodreads id." };

  const filled: string[] = [];
  if (editionId && target.goodreadsBookId === null && !(await findGoodreadsTarget(userId, data.goodreadsId))) {
    await db.update(editions).set({ goodreadsBookId: data.goodreadsId }).where(eq(editions.id, target.editionId));
    filled.push("Goodreads link");
  }
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
