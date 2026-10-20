import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { series, works } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

import { deleteIfEmpty } from "./collections";
import type { Tx } from "./works";

/**
 * "8", "2.5", "0" — or null for blank. Positions are numeric because novellas
 * sit between books (§2); the column holds two decimal places.
 */
export function parsePosition(value: string): number | null | "invalid" {
  const text = value.trim().replace(/^#/, "");
  if (!text) return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) return "invalid";
  return Number(text);
}

/**
 * The series called `name`, created if there is none. Matched without regard
 * to case, so "discworld" typed on one work joins the "Discworld" already
 * here rather than starting a second.
 */
export async function ensureSeries(tx: Tx, name: string, userId: string): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const [existing] = await tx
    .select({ id: series.id })
    .from(series)
    .where(eq(sql`lower(${series.name})`, trimmed.toLowerCase()))
    .limit(1);
  if (existing) return existing.id;

  const id = randomUUID();
  const base = slugify(trimmed);
  const [clash] = await tx.select({ id: series.id }).from(series).where(eq(series.slug, base));
  await tx.insert(series).values({
    id,
    name: trimmed,
    slug: clash ? `${base}-${id.slice(0, 8)}` : base,
    createdBy: userId,
  });
  return id;
}

/**
 * Puts a work in a series at a position, or — with a blank name — takes it
 * out. A series left with no works is deleted: series only ever come into
 * being through a work, so an empty one is debris, and it would otherwise
 * keep being offered as a name to join.
 */
export async function setWorkSeries(
  tx: Tx,
  workId: string,
  name: string,
  position: number | null,
  userId: string,
): Promise<void> {
  const [before] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));

  if (!name.trim()) {
    await tx.update(works).set({ seriesId: null, seriesPosition: null }).where(eq(works.id, workId));
  } else {
    const seriesId = await ensureSeries(tx, name, userId);
    await tx.update(works).set({ seriesId, seriesPosition: position }).where(eq(works.id, workId));
  }

  if (before?.seriesId) {
    const [left] = await tx
      .select({ id: works.id })
      .from(works)
      .where(eq(works.seriesId, before.seriesId))
      .limit(1);
    if (!left) {
      const [gone] = await tx
        .delete(series)
        .where(eq(series.id, before.seriesId))
        .returning({ collectionId: series.collectionId });
      // The series may have been all its collection had.
      if (gone?.collectionId) await deleteIfEmpty(tx, gone.collectionId);
    }
  }
}

/**
 * Takes a work out of its series. It stays in the series' collection: Halo's
 * Forerunner trilogy losing its series is still Halo, and the shelf grouped
 * by collection should not lose a book because a series went.
 */
export async function takeOutOfSeries(tx: Tx, workId: string, userId: string): Promise<void> {
  const [found] = await tx
    .select({ collectionId: series.collectionId, own: works.collectionId })
    .from(works)
    .innerJoin(series, eq(series.id, works.seriesId))
    .where(eq(works.id, workId));
  if (!found) return;

  if (found.collectionId && !found.own) {
    await tx.update(works).set({ collectionId: found.collectionId }).where(eq(works.id, workId));
  }
  await setWorkSeries(tx, workId, "", null, userId);
}

/** Every work out of a series, which `setWorkSeries` then deletes as empty. */
export async function removeSeries(tx: Tx, seriesId: string, userId: string): Promise<void> {
  const members = await tx.select({ id: works.id }).from(works).where(eq(works.seriesId, seriesId));
  for (const member of members) await takeOutOfSeries(tx, member.id, userId);
  // A series with no works at all (possible only by hand) goes too.
  await tx.delete(series).where(eq(series.id, seriesId));
}

export type Renamed = { slug: string } | { error: string };

/**
 * Renames a series, or joins it to another when the name is one already here
 * (without regard to case, as the series box matches). Joined books keep their
 * numbers. Two Comic Vine runs never join: each is measured against its own
 * volume's issue count, and one count cannot say both are read to the end.
 */
export async function renameSeries(tx: Tx, seriesId: string, name: string): Promise<Renamed> {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!trimmed) return { error: "Give the series a name." };

  const [self] = await tx.select().from(series).where(eq(series.id, seriesId));
  if (!self) return { error: "That series is gone." };

  const [other] = await tx
    .select()
    .from(series)
    .where(and(eq(sql`lower(${series.name})`, trimmed.toLowerCase()), ne(series.id, seriesId)))
    .limit(1);

  if (!other) {
    const base = slugify(trimmed);
    const [clash] = await tx
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.slug, base), ne(series.id, seriesId)));
    const slug = clash ? `${base}-${seriesId.slice(0, 8)}` : base;
    await tx.update(series).set({ name: trimmed, slug }).where(eq(series.id, seriesId));
    return { slug };
  }

  if (self.comicvineVolumeId !== null && other.comicvineVolumeId !== null) {
    return { error: `${other.name} is another Comic Vine run. Give this one a name of its own.` };
  }

  await tx.update(works).set({ seriesId: other.id }).where(eq(works.seriesId, seriesId));
  await tx
    .update(series)
    .set({
      collectionId: other.collectionId ?? self.collectionId,
      comicvineVolumeId: other.comicvineVolumeId ?? self.comicvineVolumeId,
      issueCount: other.comicvineVolumeId !== null ? other.issueCount : self.issueCount,
    })
    .where(eq(series.id, other.id));
  await tx.delete(series).where(eq(series.id, seriesId));
  if (self.collectionId && self.collectionId !== (other.collectionId ?? self.collectionId)) {
    await deleteIfEmpty(tx, self.collectionId);
  }
  return { slug: other.slug };
}
