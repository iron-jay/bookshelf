"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { missingCovers, missingCoversBatch, type MissingCover, type MissingCoverOutcome } from "@/lib/books/settings-runs";

/** "Find missing covers"; the rules are `lib/books/settings-runs.ts`, shared with the API. */

export async function listMissingCovers(): Promise<MissingCover[]> {
  const user = await requireUser();
  return missingCovers(user.id);
}

export async function findMissingCoversBatch(editionIds: unknown): Promise<MissingCoverOutcome[]> {
  const user = await requireUser();
  const outcomes = await missingCoversBatch(user.id, editionIds);
  if (outcomes.length) revalidatePath("/", "layout");
  return outcomes;
}
