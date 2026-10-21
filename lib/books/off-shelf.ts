import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

import { shelveEdition } from "./shelving";

/**
 * Books on the server that never reach your shelf, so nothing on it leads to
 * them (Jay, 2026-10-21, with gameshelf). A book stands on the shelf through
 * an entry on one of its editions; these have none of yours. Mostly books taken
 * off the shelf — the edition page's "Remove from shelf" keeps the book — and,
 * should one ever be left without, a book with no edition at all.
 */

export type OffShelfBook = {
  workId: string;
  slug: string;
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  editionCount: number;
  /** The one edition a shelf press lands on, when there is exactly one. */
  editionId: string | null;
  editionName: string | null;
  seriesName: string | null;
  seriesSlug: string | null;
  seriesPosition: string | null;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  first_published_year: number | null;
  cover_url: string | null;
  edition_count: number;
  edition_id: string | null;
  edition_name: string | null;
  edition_cover: string | null;
  series_name: string | null;
  series_slug: string | null;
  series_position: string | null;
};

export async function offShelfBooks(userId: string): Promise<OffShelfBook[]> {
  const rows = await db.execute<Row>(sql`
    SELECT w.id, w.slug, w.title, w.authors, w.first_published_year, w.cover_url,
      (SELECT count(*)::int FROM editions ed WHERE ed.work_id = w.id) AS edition_count,
      first.id AS edition_id, first.name AS edition_name, first.cover_url AS edition_cover,
      s.name AS series_name, s.slug AS series_slug, w.series_position::text AS series_position
    FROM works w
    LEFT JOIN series s ON s.id = w.series_id
    LEFT JOIN LATERAL (
      SELECT ed.id, ed.name, ed.cover_url FROM editions ed
      WHERE ed.work_id = w.id ORDER BY ed.created_at, ed.id LIMIT 1
    ) first ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM editions ed
      JOIN entries e ON e.edition_id = ed.id AND e.user_id = ${userId}
      WHERE ed.work_id = w.id
    )
    ORDER BY coalesce(w.author_sort, ''), coalesce(w.sort_title, w.title), w.id
  `);

  return rows.map((row) => {
    const single = row.edition_count === 1;
    return {
      workId: row.id,
      slug: row.slug,
      title: row.title,
      authors: row.authors ?? [],
      year: row.first_published_year,
      // An edition with no cover of its own shows the work's, as entry_cards does.
      coverUrl: (single ? row.edition_cover : null) ?? row.cover_url,
      editionCount: row.edition_count,
      editionId: single ? row.edition_id : null,
      editionName: single ? row.edition_name : null,
      seriesName: row.series_name,
      seriesSlug: row.series_slug,
      seriesPosition: row.series_position ? String(Number(row.series_position)) : null,
    };
  });
}

/**
 * Puts a book listed here on a shelf in one press, in its one edition, by the
 * edition page's rules, returning that edition. Null when there is no one
 * obvious edition: several to choose from, or none.
 */
export async function shelveOffShelfBook(userId: string, workId: string, shelf: Shelf): Promise<string | null> {
  const own = await db
    .select({ id: editions.id })
    .from(editions)
    .where(eq(editions.workId, workId))
    .orderBy(asc(editions.createdAt))
    .limit(2);
  if (own.length !== 1) return null;
  await db.transaction((tx) => shelveEdition(tx, userId, own[0].id, shelf));
  return own[0].id;
}
