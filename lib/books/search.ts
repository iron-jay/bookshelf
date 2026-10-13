import { and, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import type { Isbn } from "@/lib/isbn";

import type { LocalWork } from "./search-results";

/** This server's half of search, for the search page and the phone's API alike. */

const LOCAL_LIMIT = 20;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every word has to appear somewhere in the title or the authors, so
 * "pratchett guards" finds Guards! Guards! the way Open Library's own search
 * would, rather than needing the words in order.
 */
export async function searchLocal(userId: string, term: string): Promise<LocalWork[]> {
  const words = term.split(/\s+/).filter(Boolean);
  const haystack = sql`(${works.title} || ' ' || array_to_string(${works.authors}, ' '))`;
  const conditions: SQL[] = words.map((w) => ilike(haystack, `%${escapeLike(w)}%`));

  const rows = await db
    .select({
      id: works.id,
      slug: works.slug,
      olWorkKey: works.olWorkKey,
      title: works.title,
      subtitle: works.subtitle,
      authors: works.authors,
      firstPublishedYear: works.firstPublishedYear,
      coverUrl: works.coverUrl,
      source: works.source,
      hardcoverId: works.hardcoverId,
    })
    .from(works)
    .where(and(...conditions))
    .limit(LOCAL_LIMIT);

  return withEntries(userId, rows);
}

async function withEntries(
  userId: string,
  rows: Omit<LocalWork, "entryEditionIds">[],
): Promise<LocalWork[]> {
  if (rows.length === 0) return [];

  const mine = await db
    .select({ workId: editions.workId, editionId: editions.id })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .where(
      and(
        eq(entries.userId, userId),
        inArray(
          editions.workId,
          rows.map((row) => row.id),
        ),
      ),
    );

  return rows.map((row) => ({
    ...row,
    entryEditionIds: mine.filter((m) => m.workId === row.id).map((m) => m.editionId),
  }));
}

export type LocalEdition = {
  editionId: string;
  editionName: string;
  work: LocalWork;
};

/**
 * Checked before Open Library is asked, so a book already on this server is
 * found by ISBN with the network down. Both columns are searched because
 * Open Library records sometimes carry only one of the two.
 */
export async function findLocalEdition(userId: string, isbn: Isbn): Promise<LocalEdition | null> {
  const matches = [eq(editions.isbn13, isbn.isbn13)];
  if (isbn.isbn10) matches.push(eq(editions.isbn10, isbn.isbn10));

  const [row] = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      id: works.id,
      slug: works.slug,
      olWorkKey: works.olWorkKey,
      title: works.title,
      subtitle: works.subtitle,
      authors: works.authors,
      firstPublishedYear: works.firstPublishedYear,
      coverUrl: works.coverUrl,
      source: works.source,
      hardcoverId: works.hardcoverId,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(or(...matches))
    .limit(1);

  if (!row) return null;

  const { editionId, editionName, ...work } = row;
  const [withShelf] = await withEntries(userId, [work]);
  return { editionId, editionName, work: withShelf };
}
