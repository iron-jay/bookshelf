import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, entries, entryTags, reads, tags } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";
import { slugify } from "@/lib/slug";

import { dateFrom } from "./edit-fields";
import { changeShelf, readAgain } from "./shelving";
import { cleanTagName, ensureTag, tagEntries, untagEntries } from "./tags";

/**
 * One person's shelf row and its reads, for the edition page's server actions
 * and the phone's API alike. Every function takes the user and checks the row
 * is theirs; callers parse their own input and nothing here reads a form.
 */

/** Your entry for an edition, or null when it is not on your shelf. */
export async function ownEntry(userId: string, editionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.editionId, editionId)));
  return row?.id ?? null;
}

/** The edition one of your entries is for, or null when the entry is not yours. */
export async function editionForEntry(userId: string, entryId: string): Promise<string | null> {
  const [row] = await db
    .select({ editionId: entries.editionId })
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
  return row?.editionId ?? null;
}

export async function editionExists(editionId: string): Promise<boolean> {
  const [row] = await db.select({ id: editions.id }).from(editions).where(eq(editions.id, editionId));
  return Boolean(row);
}

/** A read, only if it belongs to one of your entries. */
export async function ownRead(
  userId: string,
  readId: string,
): Promise<{ id: string; entryId: string; editionId: string } | null> {
  const [row] = await db
    .select({ id: reads.id, entryId: reads.entryId, editionId: entries.editionId })
    .from(reads)
    .innerJoin(entries, eq(entries.id, reads.entryId))
    .where(and(eq(reads.id, readId), eq(entries.userId, userId)));
  return row ?? null;
}

/** Longest review kept. Refused rather than cut: losing the end of one silently is worse. */
export const REVIEW_MAX = 50_000;

/** Whole numbers out of ten: there are no halves (§5). */
export function isRating(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 10;
}

/**
 * Not trimmed: leading indentation and trailing blank lines can be deliberate
 * in prose. Only a review that is nothing but space is empty.
 */
export function reviewFrom(raw: string | null): string | null {
  return raw && raw.trim() ? raw : null;
}

export type EntryChanges = {
  shelf?: Shelf;
  rating?: number | null;
  review?: string | null;
  reviewHasSpoilers?: boolean;
  isFavourite?: boolean;
  isPrivate?: boolean;
};

/**
 * Applies whichever fields are present to an entry the caller has already
 * checked is the user's. A shelf change goes through changeShelf, so the read
 * rules (§5) apply however it arrives.
 */
export async function updateEntry(entryId: string, changes: EntryChanges): Promise<void> {
  const set: Partial<typeof entries.$inferInsert> = {};
  if (changes.rating !== undefined) set.rating = changes.rating;
  if (changes.review !== undefined) set.review = reviewFrom(changes.review);
  if (changes.reviewHasSpoilers !== undefined) set.reviewHasSpoilers = changes.reviewHasSpoilers;
  if (changes.isFavourite !== undefined) set.isFavourite = changes.isFavourite;
  if (changes.isPrivate !== undefined) set.isPrivate = changes.isPrivate;

  await db.transaction(async (tx) => {
    if (changes.shelf !== undefined) await changeShelf(tx, entryId, changes.shelf);
    if (Object.keys(set).length > 0) {
      await tx.update(entries).set(set).where(eq(entries.id, entryId));
    }
  });
}

export function readAgainFor(entryId: string): Promise<void> {
  return db.transaction((tx) => readAgain(tx, entryId));
}

export type ReadDates = { startedOn: string | null; finishedOn: string | null };

/**
 * "YYYY-MM-DD" that is a real day, or "" for none. A message when the dates
 * are not acceptable, null when they were saved.
 */
export async function updateRead(
  readId: string,
  raw: { startedOn: string; finishedOn: string },
): Promise<string | null> {
  const startedOn = dateFrom(raw.startedOn);
  const finishedOn = dateFrom(raw.finishedOn);
  if (startedOn === "invalid" || finishedOn === "invalid") return "Dates should be real days.";
  // The same rule as the reads_date_order constraint, said in words rather
  // than surfacing as a 500.
  if (startedOn && finishedOn && finishedOn < startedOn) return "It cannot finish before it started.";

  await db.update(reads).set({ startedOn, finishedOn }).where(eq(reads.id, readId));
  return null;
}

export async function deleteRead(readId: string): Promise<void> {
  await db.delete(reads).where(eq(reads.id, readId));
}

/** Oldest first, as the edition page lists them; undated reads lead. */
export async function readsOf(entryId: string) {
  return db
    .select({ id: reads.id, startedOn: reads.startedOn, finishedOn: reads.finishedOn })
    .from(reads)
    .where(eq(reads.entryId, entryId))
    .orderBy(
      sql`coalesce(${reads.finishedOn}, ${reads.startedOn}) asc nulls first`,
      asc(reads.createdAt),
    );
}

/** Tags a name, creating the tag if it is new. False for a blank name. */
export async function tagEntry(userId: string, entryId: string, rawName: string): Promise<boolean> {
  const name = cleanTagName(rawName);
  if (!name) return false;
  await db.transaction(async (tx) => tagEntries(tx, await ensureTag(tx, userId, name), [entryId]));
  return true;
}

/** Your tag with this id or name (matched by slug, as ensureTag matches), or null. */
export async function ownTag(userId: string, by: { id: string } | { name: string }): Promise<string | null> {
  const match =
    "id" in by
      ? eq(tags.id, by.id)
      : eq(tags.slug, slugify(cleanTagName(by.name)));
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(match, eq(tags.userId, userId)));
  return tag?.id ?? null;
}

export function untagEntry(tagId: string, entryId: string): Promise<void> {
  return db.transaction((tx) => untagEntries(tx, tagId, [entryId]));
}

/**
 * Takes the entry off your shelf, with its rating, review, reads and tags. The
 * edition and its work stay: they are the catalogue, and another account, or
 * you later, may want them. A tag left on nothing goes too, as untagging does.
 */
export async function removeEntry(entryId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const tagIds = (
      await tx.select({ id: entryTags.tagId }).from(entryTags).where(eq(entryTags.entryId, entryId))
    ).map((row) => row.id);
    for (const tagId of tagIds) await untagEntries(tx, tagId, [entryId]);
    await tx.delete(entries).where(eq(entries.id, entryId));
  });
}
