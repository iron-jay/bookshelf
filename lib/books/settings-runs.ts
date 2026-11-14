import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { findMissingCover, type MissingCoverResult } from "@/lib/books/covers";
import { fillFromHardcover, type FillResult } from "@/lib/books/hardcover-fill";
import { db } from "@/lib/db";
import { editions, entries, entryCards, works } from "@/lib/db/schema";
import { hardcoverEnabled } from "@/lib/hardcover";
import { COVER_CHUNK } from "@/lib/import-limits";
import { isUuid } from "@/lib/uuid";

/**
 * Settings → Cover art's two runs, "Find missing covers" and "Fill in from
 * Hardcover", shared by their server actions and the phone's routes. Each is a
 * list, then batches of `COVER_CHUNK` the caller sends one at a time.
 */

export type MissingCover = { editionId: string; title: string };
export type MissingCoverOutcome = MissingCover & { result: MissingCoverResult };

/**
 * Books on your shelf showing a placeholder that a lookup could fill.
 * entry_cards already applies the cover rules, so "no cover_url" there is
 * exactly "placeholder on screen".
 */
export async function missingCovers(userId: string): Promise<MissingCover[]> {
  const rows = await db
    .select({ editionId: entryCards.editionId, title: entryCards.workTitle })
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), isNull(entryCards.coverUrl)))
    .orderBy(asc(entryCards.workTitle));
  return rows.flatMap((row) => (row.editionId ? [{ editionId: row.editionId, title: row.title ?? "Untitled" }] : []));
}

/**
 * One batch, in order through the lookup queues. Ids come from the page or
 * the phone, so they are narrowed to editions on your own shelf first.
 */
export async function missingCoversBatch(userId: string, editionIds: unknown): Promise<MissingCoverOutcome[]> {
  if (!Array.isArray(editionIds)) return [];
  const ids = editionIds.filter((id): id is string => typeof id === "string" && isUuid(id)).slice(0, COVER_CHUNK);
  if (ids.length === 0) return [];
  const mine = await db
    .select({ editionId: entryCards.editionId, title: entryCards.workTitle })
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), inArray(entryCards.editionId, ids)));

  const outcomes: MissingCoverOutcome[] = [];
  for (const id of ids) {
    const title = mine.find((m) => m.editionId === id)?.title ?? "Untitled";
    if (!mine.some((m) => m.editionId === id)) {
      outcomes.push({ editionId: id, title, result: "skipped" });
      continue;
    }
    try {
      outcomes.push({ editionId: id, title, result: await findMissingCover(id) });
    } catch (error) {
      // Open Library down, a timeout: that book stays a placeholder and the
      // run carries on. Running it again retries exactly those.
      console.error(`[covers] ${id}`, error);
      outcomes.push({ editionId: id, title, result: "none" });
    }
  }
  return outcomes;
}

export type FillCandidate = { workId: string; title: string };
export type FillOutcome = FillCandidate & FillResult;

/** Local works on your shelf that Hardcover has not filled in yet. */
function candidateRows(userId: string, only?: string[]) {
  return db
    .selectDistinct({ workId: works.id, title: works.title })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .innerJoin(works, eq(works.id, editions.workId))
    .where(
      and(
        eq(entries.userId, userId),
        eq(works.source, "local"),
        isNull(works.hardcoverId),
        only ? inArray(works.id, only) : undefined,
      ),
    )
    .orderBy(asc(works.title));
}

export async function hardcoverCandidates(userId: string): Promise<FillCandidate[]> {
  if (!hardcoverEnabled()) return [];
  return candidateRows(userId);
}

/** One batch. Ids are narrowed to your own shelf's local works first. */
export async function hardcoverBatch(userId: string, workIds: unknown): Promise<FillOutcome[]> {
  if (!hardcoverEnabled() || !Array.isArray(workIds)) return [];
  const ids = workIds.filter((id): id is string => typeof id === "string" && isUuid(id)).slice(0, COVER_CHUNK);
  if (ids.length === 0) return [];
  const outcomes: FillOutcome[] = [];
  for (const { workId, title } of await candidateRows(userId, ids)) {
    try {
      outcomes.push({ workId, title, ...(await fillFromHardcover(workId, userId)) });
    } catch (error) {
      console.error(`[hardcover] fill ${workId}`, error);
      outcomes.push({ workId, title, result: "none" });
    }
  }
  return outcomes;
}
