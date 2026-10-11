import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { collections, series, works } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

import type { Tx } from "./works";

/**
 * Collections sit above series (schema.sql): Halo is a collection, the
 * Forerunner trilogy a series in it, a standalone Halo novel in it directly.
 * They behave like series — matched by name without regard to case, created
 * on first use, deleted once nothing is in them.
 */

/** What a collection is set on: a series (all its books), or a book with no series. */
export type CollectionTarget = { kind: "series"; id: string } | { kind: "work"; id: string };

async function ensureCollection(tx: Tx, name: string, userId: string): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const [existing] = await tx
    .select({ id: collections.id })
    .from(collections)
    .where(eq(sql`lower(${collections.name})`, trimmed.toLowerCase()))
    .limit(1);
  if (existing) return existing.id;

  const id = randomUUID();
  const base = slugify(trimmed);
  const [clash] = await tx.select({ id: collections.id }).from(collections).where(eq(collections.slug, base));
  await tx.insert(collections).values({
    id,
    name: trimmed,
    slug: clash ? `${base}-${id.slice(0, 8)}` : base,
    createdBy: userId,
  });
  return id;
}

/**
 * Puts a series or a book in the collection called `name`, or — blank — takes
 * it out. A collection left with nothing in it is deleted, as series are: it
 * only came into being through one of them, and would otherwise keep being
 * offered as a name to join.
 */
export async function setCollection(tx: Tx, target: CollectionTarget, name: string, userId: string): Promise<void> {
  const table = target.kind === "series" ? series : works;
  const [before] = await tx
    .select({ collectionId: table.collectionId })
    .from(table)
    .where(eq(table.id, target.id));

  const collectionId = name.trim() ? await ensureCollection(tx, name.slice(0, 200), userId) : null;
  await tx.update(table).set({ collectionId }).where(eq(table.id, target.id));

  if (before?.collectionId && before.collectionId !== collectionId) {
    await deleteIfEmpty(tx, before.collectionId);
  }
}

/**
 * When a work leaves a series it may leave a collection with nothing in it,
 * and when a series is deleted its collection loses a member: callers that
 * change those hand the old collection here.
 */
export async function deleteIfEmpty(tx: Tx, collectionId: string): Promise<void> {
  const [inSeries] = await tx
    .select({ id: series.id })
    .from(series)
    .where(eq(series.collectionId, collectionId))
    .limit(1);
  if (inSeries) return;
  const [inWorks] = await tx.select({ id: works.id }).from(works).where(eq(works.collectionId, collectionId)).limit(1);
  if (inWorks) return;
  await tx.delete(collections).where(eq(collections.id, collectionId));
}
