"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { addFromCatalogue, comicBook } from "@/lib/books/add-from-catalogue";
import { dateFrom } from "@/lib/books/edit-fields";
import { comicvineEnabled, getVolume } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { series, works } from "@/lib/db/schema";
import { isShelf } from "@/lib/shelves";

import { ISSUE_CHUNK } from "./limits";

export type IssueOutcome = { issueId: number; entryId: string | null; added: boolean };

export type IssuesBatch = {
  error: string | null;
  outcomes: IssueOutcome[];
  /** The series these issues are in now, for the page to land on after the last batch. */
  seriesSlug: string | null;
};

function isIssueId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) < 2_147_483_648;
}

/**
 * A few of a volume's issues at once, as the page sends them — a run read in
 * one go (2026-10-17). The page drives the batches, as the Goodreads import
 * does, so a fifty-issue run never sits in one request; each issue is the
 * same add as picking it alone. `finishedOn` counts only for Finished.
 */
export async function addComicIssues(input: {
  volumeId: number;
  issueIds: number[];
  shelf: string;
  finishedOn: string;
}): Promise<IssuesBatch> {
  const user = await requireUser();
  const fail = (error: string): IssuesBatch => ({ error, outcomes: [], seriesSlug: null });

  if (!comicvineEnabled()) return fail("This server has no Comic Vine key.");
  if (
    !isIssueId(input.volumeId) ||
    !Array.isArray(input.issueIds) ||
    input.issueIds.length === 0 ||
    input.issueIds.length > ISSUE_CHUNK ||
    !input.issueIds.every(isIssueId)
  ) {
    return fail("Choose which ones to add.");
  }
  const shelf = isShelf(input.shelf) ? input.shelf : "tbr";
  const finishedOn = shelf === "finished" ? dateFrom(String(input.finishedOn ?? "").trim()) : null;
  if (finishedOn === "invalid") return fail("Give the day you finished as a real date.");

  const volume = await getVolume(input.volumeId);
  if (!volume) return fail("Comic Vine did not answer just now. Nothing more was added; try again in a moment.");

  const outcomes: IssueOutcome[] = [];
  for (const issueId of input.issueIds) {
    const book = await comicBook(issueId, volume);
    if (!book) {
      outcomes.push({ issueId, entryId: null, added: false });
      continue;
    }
    const result = await addFromCatalogue({
      userId: user.id,
      book,
      format: "book",
      shelf,
      on: finishedOn ?? undefined,
    });
    outcomes.push({ issueId, entryId: result.entryId, added: result.added });
  }

  const [inSeries] = await db
    .select({ slug: series.slug })
    .from(works)
    .innerJoin(series, eq(series.id, works.seriesId))
    .where(inArray(works.comicvineIssueId, input.issueIds))
    .limit(1);

  revalidatePath("/");
  return { error: null, outcomes, seriesSlug: inSeries?.slug ?? null };
}
