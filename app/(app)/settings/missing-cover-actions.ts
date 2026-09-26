"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { findMissingCover, type MissingCoverResult } from "@/lib/books/covers";
import { db } from "@/lib/db";
import { entryCards } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import { COVER_CHUNK } from "./import-limits";

export type MissingCover = { editionId: string; title: string };
export type MissingCoverOutcome = MissingCover & { result: MissingCoverResult };

/**
 * Books on your shelf showing a placeholder that a lookup could fill: not fan
 * translations, which never get one guessed. entry_cards already applies the
 * cover rules, so "no cover_url" there is exactly "placeholder on screen".
 */
export async function listMissingCovers(): Promise<MissingCover[]> {
  const user = await requireUser();
  const rows = await db
    .select({ editionId: entryCards.editionId, title: entryCards.workTitle })
    .from(entryCards)
    .where(
      and(
        eq(entryCards.userId, user.id),
        isNull(entryCards.coverUrl),
        eq(entryCards.isCommunityEdition, false),
      ),
    )
    .orderBy(asc(entryCards.workTitle));
  return rows.flatMap((row) => (row.editionId ? [{ editionId: row.editionId, title: row.title ?? "Untitled" }] : []));
}

/**
 * One batch, in order through the lookup queues. Ids come from the page, so
 * they are narrowed to editions on your own shelf first.
 */
export async function findMissingCoversBatch(editionIds: unknown): Promise<MissingCoverOutcome[]> {
  const user = await requireUser();
  if (!Array.isArray(editionIds)) return [];
  const ids = editionIds.filter((id): id is string => typeof id === "string" && isUuid(id)).slice(0, COVER_CHUNK);
  if (ids.length === 0) return [];

  const mine = await db
    .select({ editionId: entryCards.editionId, title: entryCards.workTitle })
    .from(entryCards)
    .where(and(eq(entryCards.userId, user.id), inArray(entryCards.editionId, ids)));

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
  revalidatePath("/", "layout");
  return outcomes;
}
