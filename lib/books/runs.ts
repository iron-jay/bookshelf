import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";

import { comicvineEnabled, getIssue, getVolume } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { editions, entries, series, works } from "@/lib/db/schema";

import { ensureSeries } from "./series";
import type { ShelfRow } from "./shelf";
import type { Tx } from "./works";

/**
 * A comic run read to the end, folded into one tile on the shelf (Jay,
 * 2026-10-19). A run is one work per issue (§4c), so a finished run of fifty
 * would otherwise be fifty tiles of nearly the same cover. "The end" is Comic
 * Vine's issue count for the volume, kept on the series, not how many issues
 * happen to be here: a run you have only partly added never folds.
 *
 * The tile opens the series page, which lists every issue with its own shelf
 * state, so nothing is hidden, only stacked.
 */

export type Run = { seriesId: string; slug: string; name: string; issueCount: number };

export type RunVolume = { comicvineVolumeId: number; issueCount: number; startYear: number | null };

/**
 * The series a Comic Vine volume's issues go in. One per volume, because the
 * count that says a run is read to the end is the volume's: Saga's issues
 * (2012, 72) and its trade paperbacks (2012, 12) are both called "Saga" on
 * Comic Vine, and sharing one series would measure either against the other.
 *
 * The volume's own series if it has one; else the series of that name, if no
 * other volume has claimed it (one you made by hand, or one from before
 * volumes were kept); else a new one named with the volume's year, or failing
 * that its Comic Vine number, so the two are told apart.
 */
export async function runSeries(tx: Tx, name: string, run: RunVolume, userId: string): Promise<string> {
  const counted = { comicvineVolumeId: run.comicvineVolumeId, issueCount: run.issueCount };

  const [own] = await tx
    .select({ id: series.id })
    .from(series)
    .where(eq(series.comicvineVolumeId, run.comicvineVolumeId))
    .limit(1);
  if (own) {
    await tx.update(series).set(counted).where(eq(series.id, own.id));
    return own.id;
  }

  const named = async (candidate: string) =>
    (
      await tx
        .select({ id: series.id, volumeId: series.comicvineVolumeId })
        .from(series)
        .where(eq(sql`lower(${series.name})`, candidate.trim().replace(/\s+/g, " ").toLowerCase()))
        .limit(1)
    )[0];

  const candidates = [name, run.startYear ? `${name} (${run.startYear})` : null, `${name} (Comic Vine ${run.comicvineVolumeId})`];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const existing = await named(candidate);
    if (existing && existing.volumeId !== null) continue;
    const id = existing?.id ?? (await ensureSeries(tx, candidate, userId));
    await tx.update(series).set(counted).where(eq(series.id, id));
    return id;
  }
  // Unreachable: the last name carries the volume's own id, which no other
  // volume's series can have claimed.
  throw new Error(`No series name left for Comic Vine volume ${run.comicvineVolumeId}`);
}

/**
 * Keeps the issue count up to date as an issue of a run is added again: a run
 * still coming out gains issues, and the newest count is what "read to the
 * end" is measured against. Only on the volume's own series.
 */
export async function recordRun(tx: Tx, workId: string, run: RunVolume): Promise<void> {
  const [work] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));
  if (!work?.seriesId) return;
  await tx
    .update(series)
    .set({ issueCount: run.issueCount })
    .where(and(eq(series.id, work.seriesId), eq(series.comicvineVolumeId, run.comicvineVolumeId)));
}

/**
 * For a comic series added before counts were kept: asks Comic Vine once, by
 * one of its issues, and stores the answer. Nothing happens without a key, for
 * a series that is not a comic run, or when Comic Vine does not answer — the
 * next visit asks again.
 */
export async function countRunIfMissing(seriesId: string): Promise<void> {
  if (!comicvineEnabled()) return;
  const [issue] = await db
    .select({ issueId: works.comicvineIssueId })
    .from(works)
    .innerJoin(series, eq(series.id, works.seriesId))
    .where(and(eq(works.seriesId, seriesId), isNotNull(works.comicvineIssueId), isNull(series.issueCount)))
    .limit(1);
  if (!issue?.issueId) return;

  const found = await getIssue(issue.issueId);
  const volume = found?.volume ? await getVolume(found.volume.id) : null;
  if (!volume || volume.issueCount < 1) return;
  await db
    .update(series)
    .set({ comicvineVolumeId: volume.id, issueCount: volume.issueCount })
    .where(eq(series.id, seriesId));
}

/**
 * Your runs read to the end: series with a Comic Vine issue count of more
 * than one, where you have finished at least that many of its works. Finished
 * means an entry on Finished, in any edition.
 */
export async function completeRuns(userId: string): Promise<Map<string, Run>> {
  const rows = await db
    .select({ seriesId: series.id, slug: series.slug, name: series.name, issueCount: series.issueCount })
    .from(series)
    .innerJoin(works, eq(works.seriesId, series.id))
    .innerJoin(editions, eq(editions.workId, works.id))
    .innerJoin(
      entries,
      and(eq(entries.editionId, editions.id), eq(entries.userId, userId), eq(entries.status, "finished")),
    )
    .where(gt(series.issueCount, 1))
    .groupBy(series.id)
    .having(sql`count(DISTINCT ${works.id}) >= ${series.issueCount}`);
  return new Map(rows.map((r) => [r.seriesId, { ...r, issueCount: r.issueCount ?? 0 }]));
}

export type FoldedRow = { row: ShelfRow; run: Run | null };

/**
 * The shelf's rows with each complete run's finished entries stacked into
 * one, where the run's first finished entry in the shelf's order stood. That
 * one shows the lowest-numbered issue (its cover is the run's), and the run's
 * latest finish, so sorting and grouping by finish still place it right.
 * Entries of a run not on Finished — a second edition on To read — stay as
 * themselves.
 */
export function foldRuns(rows: ShelfRow[], runs: Map<string, Run>): FoldedRow[] {
  if (runs.size === 0) return rows.map((row) => ({ row, run: null }));

  const members = new Map<string, ShelfRow[]>();
  for (const row of rows) {
    if (row.status !== "finished" || !row.seriesId || !runs.has(row.seriesId)) continue;
    members.set(row.seriesId, [...(members.get(row.seriesId) ?? []), row]);
  }

  const folded: FoldedRow[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const run = row.seriesId && row.status === "finished" ? runs.get(row.seriesId) : undefined;
    if (!run) {
      folded.push({ row, run: null });
      continue;
    }
    if (placed.has(run.seriesId)) continue;
    placed.add(run.seriesId);

    const all = members.get(run.seriesId)!;
    const first = all.reduce((a, b) =>
      (b.seriesPosition ?? Number.POSITIVE_INFINITY) < (a.seriesPosition ?? Number.POSITIVE_INFINITY) ? b : a,
    );
    const lastFinishedOn = all.reduce<string | null>(
      (latest, r) => (r.lastFinishedOn && (!latest || r.lastFinishedOn > latest) ? r.lastFinishedOn : latest),
      null,
    );
    folded.push({ row: { ...first, lastFinishedOn }, run });
  }
  return folded;
}
