import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
import type { ShelfRow } from "@/lib/books/shelf";

export type SeriesOnShelf = {
  slug: string;
  name: string;
  /** Books, not entries: the paperback and the audiobook are one Discworld book. */
  books: number;
  finished: number;
  title: string;
  authors: string[];
  /** The lowest-numbered book's cover, so a series is fronted by where it starts. */
  coverUrl: string | null;
};

/**
 * The series your shelf touches, for the overview's Series strip, folded from
 * the rows the shelf already has. Alphabetical, as the wall groups them.
 */
export async function seriesOnShelf(rows: readonly ShelfRow[]): Promise<SeriesOnShelf[]> {
  type Acc = { name: string; works: Set<string>; finished: Set<string>; front: ShelfRow | null };
  const byId = new Map<string, Acc>();

  const rank = (row: ShelfRow) => [row.seriesPosition ?? Number.POSITIVE_INFINITY, row.year ?? Number.POSITIVE_INFINITY];

  for (const row of rows) {
    if (!row.seriesId || !row.seriesName || !row.workId) continue;
    const acc = byId.get(row.seriesId) ?? { name: row.seriesName, works: new Set(), finished: new Set(), front: null };
    acc.works.add(row.workId);
    if (row.status === "finished") acc.finished.add(row.workId);
    // The first book leads; among its editions, one with art.
    if (!acc.front) acc.front = row;
    else {
      const [p, y] = rank(row);
      const [fp, fy] = rank(acc.front);
      if (p < fp || (p === fp && y < fy) || (p === fp && y === fy && !acc.front.coverUrl && row.coverUrl)) {
        acc.front = row;
      }
    }
    byId.set(row.seriesId, acc);
  }
  if (byId.size === 0) return [];

  const slugs = new Map(
    (await db.select({ id: series.id, slug: series.slug }).from(series).where(inArray(series.id, [...byId.keys()]))).map(
      (s) => [s.id, s.slug],
    ),
  );

  return [...byId.entries()]
    .filter(([id]) => slugs.has(id))
    .map(([id, acc]) => ({
      slug: slugs.get(id)!,
      name: acc.name,
      books: acc.works.size,
      finished: acc.finished.size,
      title: acc.front?.workTitle ?? acc.name,
      authors: acc.front?.authors ?? [],
      coverUrl: acc.front?.coverUrl ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
