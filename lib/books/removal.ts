import { and, count, eq, inArray, ne, notExists, notInArray } from "drizzle-orm";

import { deleteCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, entryTags, reads, series, tags, works } from "@/lib/db/schema";

import { deleteIfEmpty } from "./collections";
import type { Tx } from "./works";

/**
 * What deleting a book or an edition takes with it, so the confirmation page
 * can say it out loud. The database cascades silently (as gameshelf's
 * lib/works/removal.ts says), and this is everyone's entries, not only yours.
 */
export type Removal = {
  editionCount: number;
  entryCount: number;
  readCount: number;
  /** Editions of other books that translate or narrate these; they stay. */
  dependentEditions: { id: string; name: string; workTitle: string }[];
};

async function describe(editionIds: string[]): Promise<Omit<Removal, "editionCount">> {
  if (editionIds.length === 0) return { entryCount: 0, readCount: 0, dependentEditions: [] };

  const [[entryRow], [readRow], dependentEditions] = await Promise.all([
    db.select({ total: count() }).from(entries).where(inArray(entries.editionId, editionIds)),
    db
      .select({ total: count() })
      .from(reads)
      .innerJoin(entries, eq(entries.id, reads.entryId))
      .where(inArray(entries.editionId, editionIds)),
    // base_edition_id is ON DELETE SET NULL: these survive, but stop saying
    // what they were made from. Worth saying before rather than after.
    db
      .select({ id: editions.id, name: editions.name, workTitle: works.title })
      .from(editions)
      .innerJoin(works, eq(works.id, editions.workId))
      .where(and(inArray(editions.baseEditionId, editionIds), notInArray(editions.id, editionIds))),
  ]);

  return { entryCount: entryRow.total, readCount: readRow.total, dependentEditions };
}

export async function inspectWorkRemoval(workId: string): Promise<Removal> {
  const ids = (await db.select({ id: editions.id }).from(editions).where(eq(editions.workId, workId))).map(
    (row) => row.id,
  );
  return { editionCount: ids.length, ...(await describe(ids)) };
}

export async function inspectEditionRemoval(editionId: string): Promise<Removal> {
  return { editionCount: 1, ...(await describe([editionId])) };
}

/** How many editions the book has: its last one only goes with it (§2). */
export async function editionCount(workId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(editions).where(eq(editions.workId, workId));
  return row.total;
}

/**
 * Tags exist only by being applied (lib/books/tags.ts), so one left on
 * nothing once these entries go is debris, as untagging treats it.
 */
async function tagsOnlyOn(tx: Tx, editionIds: string[]): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: entryTags.tagId })
    .from(entryTags)
    .innerJoin(entries, eq(entries.id, entryTags.entryId))
    .where(inArray(entries.editionId, editionIds));
  return rows.map((row) => row.id);
}

async function pruneTags(tx: Tx, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  await tx
    .delete(tags)
    .where(
      and(
        inArray(tags.id, tagIds),
        notExists(tx.select({ one: entryTags.tagId }).from(entryTags).where(eq(entryTags.tagId, tags.id))),
      ),
    );
}

/**
 * Cover files go after the rows, and only when nothing else still points at
 * them: a failed unlink should not undo a confirmed delete, and an edition
 * may carry the same stored file as its work.
 */
async function removeUnusedCovers(paths: (string | null)[]): Promise<void> {
  const candidates = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (candidates.length === 0) return;
  const [stillWorks, stillEditions] = await Promise.all([
    db.select({ path: works.coverUrl }).from(works).where(inArray(works.coverUrl, candidates)),
    db.select({ path: editions.coverUrl }).from(editions).where(inArray(editions.coverUrl, candidates)),
  ]);
  const used = new Set([...stillWorks, ...stillEditions].map((row) => row.path));
  await Promise.all(candidates.filter((path) => !used.has(path)).map((path) => deleteCover(path)));
}

/**
 * Deletes the book: every edition, everyone's entries with their reads and
 * tags. A series or collection left empty goes too, as it does when a book
 * leaves one (lib/books/series.ts).
 */
export async function removeWork(workId: string): Promise<boolean> {
  const covers: (string | null)[] = [];

  const removed = await db.transaction(async (tx) => {
    const [work] = await tx
      .select({ seriesId: works.seriesId, collectionId: works.collectionId, coverUrl: works.coverUrl })
      .from(works)
      .where(eq(works.id, workId));
    if (!work) return false;

    const editionRows = await tx
      .select({ id: editions.id, coverUrl: editions.coverUrl })
      .from(editions)
      .where(eq(editions.workId, workId));
    const tagIds = editionRows.length ? await tagsOnlyOn(tx, editionRows.map((row) => row.id)) : [];

    await tx.delete(works).where(eq(works.id, workId));
    await pruneTags(tx, tagIds);

    if (work.seriesId) {
      const [left] = await tx.select({ id: works.id }).from(works).where(eq(works.seriesId, work.seriesId)).limit(1);
      if (!left) {
        const [gone] = await tx
          .delete(series)
          .where(eq(series.id, work.seriesId))
          .returning({ collectionId: series.collectionId });
        if (gone?.collectionId) await deleteIfEmpty(tx, gone.collectionId);
      }
    }
    if (work.collectionId) await deleteIfEmpty(tx, work.collectionId);

    covers.push(work.coverUrl, ...editionRows.map((row) => row.coverUrl));
    return true;
  });

  if (removed) await removeUnusedCovers(covers);
  return removed;
}

/**
 * Deletes one edition and everyone's entries on it. Refuses the book's last
 * edition: a work never stands without one, so that goes with removeWork.
 */
export async function removeEdition(editionId: string): Promise<boolean> {
  const covers: (string | null)[] = [];

  const removed = await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ workId: editions.workId, coverUrl: editions.coverUrl })
      .from(editions)
      .where(eq(editions.id, editionId));
    if (!edition) return false;

    const [others] = await tx
      .select({ total: count() })
      .from(editions)
      .where(and(eq(editions.workId, edition.workId), ne(editions.id, editionId)));
    if (others.total === 0) return false;

    const tagIds = await tagsOnlyOn(tx, [editionId]);
    await tx.delete(editions).where(eq(editions.id, editionId));
    await pruneTags(tx, tagIds);

    covers.push(edition.coverUrl);
    return true;
  });

  if (removed) await removeUnusedCovers(covers);
  return removed;
}
