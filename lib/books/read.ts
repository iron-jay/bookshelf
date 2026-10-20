import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { collections, editions, entries, entryCards, entryTags, series, tags, works } from "@/lib/db/schema";

import { readsOf } from "./entries";
import type { ShelfRow } from "./shelf";

/**
 * Read-only views of one entry, edition or work for the phone's API. The web
 * pages build richer versions of these inline; these carry the fields a phone
 * shows and leave out the catalogue payloads.
 */

export type EntryDetail = {
  row: ShelfRow;
  review: string | null;
  reviewHasSpoilers: boolean;
  isPrivate: boolean;
  tags: { id: string; slug: string; name: string }[];
  reads: { id: string; startedOn: string | null; finishedOn: string | null }[];
};

/** One of this user's entries, or null when it is not theirs or does not exist. */
export async function entryDetail(userId: string, entryId: string): Promise<EntryDetail | null> {
  const [row] = await db
    .select()
    .from(entryCards)
    .where(and(eq(entryCards.entryId, entryId), eq(entryCards.userId, userId)));
  if (!row) return null;

  // The view leaves out the long and private fields, so a shelf of hundreds
  // does not carry every review; one entry fetches them.
  const [extra] = await db
    .select({
      review: entries.review,
      reviewHasSpoilers: entries.reviewHasSpoilers,
      isPrivate: entries.isPrivate,
    })
    .from(entries)
    .where(eq(entries.id, entryId));

  const entryTagRows = await db
    .select({ id: tags.id, slug: tags.slug, name: tags.name })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(eq(entryTags.entryId, entryId))
    .orderBy(asc(tags.name));

  return { row, ...extra, tags: entryTagRows, reads: await readsOf(entryId) };
}

const editionColumns = {
  id: editions.id,
  name: editions.name,
  kind: editions.kind,
  format: editions.format,
  language: editions.language,
  publisher: editions.publisher,
  publishedOn: editions.publishedOn,
  pages: editions.pages,
  durationMinutes: editions.durationMinutes,
  isbn13: editions.isbn13,
  isbn10: editions.isbn10,
  credit: editions.credit,
  url: editions.url,
  coverUrl: editions.coverUrl,
};

/** An edition, the work it belongs to, and your entry for it if it is on your shelf. */
export async function editionDetail(userId: string, editionId: string) {
  const [row] = await db
    .select({
      edition: editionColumns,
      work: { slug: works.slug, title: works.title, authors: works.authors, coverUrl: works.coverUrl },
      entryId: entries.id,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .leftJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(eq(editions.id, editionId));
  if (!row) return null;

  return {
    ...row.edition,
    // The edition's own cover where it has one, else the work's, as the shelf shows it.
    coverUrl: row.edition.coverUrl ?? row.work.coverUrl,
    work: { slug: row.work.slug, title: row.work.title, authors: row.work.authors },
    entryId: row.entryId,
  };
}

/** A work by slug: its editions with your entry on each, its series and its collection. */
export async function workDetail(userId: string, slug: string) {
  const [work] = await db.select().from(works).where(eq(works.slug, slug));
  if (!work) return null;

  const editionRows = await db
    .select({ ...editionColumns, entryId: entries.id, shelf: entries.status, rating: entries.rating })
    .from(editions)
    .leftJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(eq(editions.workId, work.id))
    .orderBy(asc(editions.createdAt));

  const [inSeries] = work.seriesId
    ? await db
        .select({ id: series.id, name: series.name, slug: series.slug, collectionId: series.collectionId })
        .from(series)
        .where(eq(series.id, work.seriesId))
    : [];

  // In a series, the series carries the collection for all its books.
  const collectionId = inSeries ? inSeries.collectionId : work.collectionId;
  const [inCollection] = collectionId
    ? await db
        .select({ name: collections.name, slug: collections.slug })
        .from(collections)
        .where(eq(collections.id, collectionId))
    : [];

  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    subtitle: work.subtitle,
    authors: work.authors,
    summary: work.summary,
    firstPublishedYear: work.firstPublishedYear,
    coverUrl: work.coverUrl,
    source: work.source,
    series: inSeries
      ? { name: inSeries.name, slug: inSeries.slug, position: work.seriesPosition }
      : null,
    collection: inCollection ?? null,
    editions: editionRows,
  };
}

/**
 * A series by slug: its works in reading order (unnumbered last, as the
 * series page lists them) with your entries on each, and its collection.
 */
export async function seriesDetail(userId: string, slug: string) {
  const [found] = await db.select().from(series).where(eq(series.slug, slug));
  if (!found) return null;

  const members = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      authors: works.authors,
      position: works.seriesPosition,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.seriesId, found.id))
    .orderBy(sql`${works.seriesPosition} asc nulls last`, asc(works.title));

  const mine = members.length
    ? await db
        .select({
          workId: editions.workId,
          entryId: entries.id,
          editionId: editions.id,
          editionName: editions.name,
          shelf: entries.status,
          rating: entries.rating,
        })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(and(eq(entries.userId, userId), inArray(editions.workId, members.map((m) => m.id))))
    : [];

  const [inCollection] = found.collectionId
    ? await db
        .select({ name: collections.name, slug: collections.slug })
        .from(collections)
        .where(eq(collections.id, found.collectionId))
    : [];

  return {
    id: found.id,
    slug: found.slug,
    name: found.name,
    collection: inCollection ?? null,
    works: members.map((work) => ({
      ...work,
      entries: mine
        .filter((m) => m.workId === work.id)
        .map((m) => ({ entryId: m.entryId, editionId: m.editionId, editionName: m.editionName, shelf: m.shelf, rating: m.rating })),
    })),
  };
}
