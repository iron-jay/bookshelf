"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { fillFromHardcover, type FillResult } from "@/lib/books/hardcover-fill";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { hardcoverEnabled } from "@/lib/hardcover";
import { isUuid } from "@/lib/uuid";

import { COVER_CHUNK } from "./import-limits";

export type FillCandidate = { workId: string; title: string };
export type FillOutcome = FillCandidate & FillResult;

/** Local works on your shelf that Hardcover has not filled in yet. */
async function candidateRows(userId: string, only?: string[]) {
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

export async function listHardcoverCandidates(): Promise<FillCandidate[]> {
  const user = await requireUser();
  if (!hardcoverEnabled()) return [];
  return candidateRows(user.id);
}

/** One batch. Ids from the page are narrowed to your own shelf's local works first. */
export async function fillFromHardcoverBatch(workIds: unknown): Promise<FillOutcome[]> {
  const user = await requireUser();
  if (!hardcoverEnabled() || !Array.isArray(workIds)) return [];
  const ids = workIds.filter((id): id is string => typeof id === "string" && isUuid(id)).slice(0, COVER_CHUNK);
  if (ids.length === 0) return [];

  const mine = await candidateRows(user.id, ids);
  const outcomes: FillOutcome[] = [];
  for (const { workId, title } of mine) {
    try {
      outcomes.push({ workId, title, ...(await fillFromHardcover(workId, user.id)) });
    } catch (error) {
      console.error(`[hardcover] fill ${workId}`, error);
      outcomes.push({ workId, title, result: "none" });
    }
  }
  revalidatePath("/", "layout");
  return outcomes;
}
