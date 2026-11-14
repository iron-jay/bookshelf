"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { hardcoverBatch, hardcoverCandidates, type FillCandidate, type FillOutcome } from "@/lib/books/settings-runs";

/** "Fill in from Hardcover"; the rules are `lib/books/settings-runs.ts`, shared with the API. */

export async function listHardcoverCandidates(): Promise<FillCandidate[]> {
  const user = await requireUser();
  return hardcoverCandidates(user.id);
}

export async function fillFromHardcoverBatch(workIds: unknown): Promise<FillOutcome[]> {
  const user = await requireUser();
  const outcomes = await hardcoverBatch(user.id, workIds);
  if (outcomes.length) revalidatePath("/", "layout");
  return outcomes;
}
