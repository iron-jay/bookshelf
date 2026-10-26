import { randomUUID } from "node:crypto";

import { and, asc, eq, gte, isNull, ne, sql } from "drizzle-orm";

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
 * "Latest" on the add form (Jay, 2026-10-26): the book goes at the end of
 * its series, so nobody has to look up what number the last one was.
 * Resolved when the book is placed, not when the form was drawn.
 */
export const LATEST = "latest";
export type Position = number | null | typeof LATEST;

/**
 * One past the highest whole number in a series (after 2.5 comes 3), or 1 for
 * a series with no numbered book. `exceptWorkId` is the book being placed,
 * which must not count itself.
 */
export async function nextPosition(tx: Pick<Tx, "select">, seriesId: string, exceptWorkId?: string): Promise<number> {
  const [row] = await tx
    .select({ last: sql<string | null>`max(${works.seriesPosition})` })
    .from(works)
    .where(exceptWorkId ? and(eq(works.seriesId, seriesId), ne(works.id, exceptWorkId)) : eq(works.seriesId, seriesId));
  return row?.last === null || row?.last === undefined ? 1 : Math.floor(Number(row.last)) + 1;
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
  position: Position,
  userId: string,
): Promise<void> {
  const [before] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));

  if (!name.trim()) {
    await tx.update(works).set({ seriesId: null, seriesPosition: null }).where(eq(works.id, workId));
  } else {
    const seriesId = await ensureSeries(tx, name, userId);
    const at = position === LATEST ? await nextPosition(tx, seriesId, workId) : position;
    await tx.update(works).set({ seriesId, seriesPosition: at }).where(eq(works.id, workId));
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

export type TakenNumber = { title: string; series: string; position: number };

/**
 * Another book already at `position` in the series called `name`, so the
 * series box can ask before two books share a number (Jay, 2026-10-21).
 * Comic Vine runs are left out: their numbers are the issues' own, and
 * shifting them would make them disagree with Comic Vine.
 */
export async function takenNumber(
  tx: Tx,
  name: string,
  position: number,
  workId: string,
): Promise<TakenNumber | null> {
  const [found] = await tx
    .select({ title: works.title, series: series.name, position: works.seriesPosition })
    .from(works)
    .innerJoin(series, eq(series.id, works.seriesId))
    .where(
      and(
        eq(sql`lower(${series.name})`, name.trim().replace(/\s+/g, " ").toLowerCase()),
        isNull(series.comicvineVolumeId),
        sql`${works.seriesPosition} = ${position}`,
        ne(works.id, workId),
      ),
    )
    .orderBy(asc(works.title))
    .limit(1);
  return found && found.position !== null ? { title: found.title, series: found.series, position: found.position } : null;
}

/**
 * Makes room at `position`: every other book in the work's series numbered
 * there or later moves up one, so #4 becomes #5 and a novella at 4.5 becomes
 * 5.5. Gaps further down are left as they are.
 */
export async function shiftUpFrom(tx: Tx, workId: string, position: number): Promise<void> {
  const [work] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));
  if (!work?.seriesId) return;
  await tx
    .update(works)
    .set({ seriesPosition: sql`${works.seriesPosition} + 1` })
    .where(and(eq(works.seriesId, work.seriesId), gte(works.seriesPosition, position), ne(works.id, workId)));
}
