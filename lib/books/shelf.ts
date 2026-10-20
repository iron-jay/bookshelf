import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { entryCards, entryTags, tags } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

/**
 * The shelf's query, for the shelf page and the phone's API alike. Grouping is
 * the page's own business: it is how a screen lays rows out, not which rows.
 */

export const SHELF_SORTS = {
  added: "Recently added",
  title: "Title",
  author: "Author",
  rated: "Rating",
  finished: "Last finished",
} as const;
export type ShelfSort = keyof typeof SHELF_SORTS;

export function isShelfSort(value: unknown): value is ShelfSort {
  return typeof value === "string" && Object.hasOwn(SHELF_SORTS, value);
}

// Every sort ends on something unique-ish, so the order is stable between
// renders rather than shuffling ties.
const ORDER_BY: Readonly<Record<ShelfSort, SQL>> = {
  added: sql`added_at desc`,
  title: sql`lower(work_title), edition_name, added_at desc`,
  author: sql`lower(author_sort) nulls last, lower(work_title), added_at desc`,
  rated: sql`rating desc nulls last, added_at desc`,
  finished: sql`last_finished_on desc nulls last, updated_at desc, added_at desc`,
};

export type ShelfRow = typeof entryCards.$inferSelect;

export type ShelfFilters = { status?: Shelf; tag?: string; sort?: ShelfSort };

/** Your tags that something carries, with counts, so a filter never offers a choice that returns nothing. */
export function tagsWithCounts(userId: string) {
  return db
    .select({ id: tags.id, slug: tags.slug, name: tags.name, n: count() })
    .from(tags)
    .innerJoin(entryTags, eq(entryTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
}

/** `tag` is a slug. */
export function shelfRows(userId: string, filters: ShelfFilters = {}): Promise<ShelfRow[]> {
  const where = [eq(entryCards.userId, userId)];
  if (filters.status) where.push(eq(entryCards.status, filters.status));
  if (filters.tag) {
    where.push(
      inArray(
        entryCards.entryId,
        db
          .select({ id: entryTags.entryId })
          .from(entryTags)
          .innerJoin(tags, eq(tags.id, entryTags.tagId))
          .where(and(eq(tags.userId, userId), eq(tags.slug, filters.tag))),
      ),
    );
  }

  return db
    .select()
    .from(entryCards)
    .where(and(...where))
    .orderBy(ORDER_BY[filters.sort ?? "added"]);
}
