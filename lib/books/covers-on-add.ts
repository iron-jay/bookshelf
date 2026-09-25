import { eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { coverByIsbn, coverByTitle } from "@/lib/googlebooks";
import { coverUrl } from "@/lib/openlibrary";

type CoverTarget = {
  work: { id: string; title: string; firstAuthor: string | null; coverId: number | null } | null;
  /** Always the work the edition hangs off, whether or not this add created it. */
  workId: string;
  edition: { id: string; coverId: number | null; isbn13: string | null } | null;
};

/**
 * The §4a order, run once for the rows an add just created:
 *
 *   1. Open Library, by cover id — the edition's own, and the work's.
 *   2. Google Books by the edition's ISBN. Exact, so no review.
 *   3. Google Books by title and author. Fuzzy, so flagged for /art.
 *   4. Nothing: the typeset placeholder, which is not an error.
 *
 * 2 and 3 only run when nothing is on screen yet — an edition with no art of
 * its own already shows the work's, and that is the brief's order working.
 *
 * Only for official editions. Community editions never inherit a cover and
 * never get one guessed for them; they come through a different door.
 */
export async function lookUpCoversOnAdd(target: CoverTarget): Promise<void> {
  let editionHasCover = false;
  let workHasCover = false;

  if (target.edition?.coverId) {
    editionHasCover = await applyEditionCover(
      target.edition.id,
      coverUrl(target.edition.coverId, "L"),
      "openlibrary",
      false,
    );
  }

  if (target.work?.coverId) {
    workHasCover = await applyWorkCover(
      target.work.id,
      coverUrl(target.work.coverId, "L"),
      "openlibrary",
      false,
    );
  }

  // A work this add did not create may already have art; if so, the edition
  // is already covered and Google is not asked.
  if (!target.work && !editionHasCover) {
    const [existing] = await db
      .select({ coverUrl: works.coverUrl })
      .from(works)
      .where(eq(works.id, target.workId));
    workHasCover = Boolean(existing?.coverUrl);
  }

  if (editionHasCover || workHasCover) return;

  if (target.edition?.isbn13) {
    const found = await coverByIsbn(target.edition.isbn13);
    if (found && (await applyEditionCover(target.edition.id, found.url, "googlebooks", false, found.volumeId))) {
      return;
    }
  }

  if (target.work) {
    const found = await coverByTitle(target.work.title, target.work.firstAuthor);
    if (found) await applyWorkCover(target.work.id, found.url, "googlebooks", true);
  }
}

// ?default=false makes a missing cover a 404 instead of a 43-byte gif.
function withNoDefault(url: string): string {
  return url.includes("covers.openlibrary.org") ? `${url}?default=false` : url;
}

async function applyEditionCover(
  editionId: string,
  url: string,
  source: "openlibrary" | "googlebooks",
  needsReview: boolean,
  googleVolumeId?: string,
): Promise<boolean> {
  const stored = await downloadCover(withNoDefault(url), editionId);
  if (!stored) return false;
  await db
    .update(editions)
    .set({
      coverUrl: stored,
      coverSource: source,
      coverNeedsReview: needsReview,
      ...(googleVolumeId ? { googleVolumeId } : {}),
    })
    .where(eq(editions.id, editionId));
  return true;
}

async function applyWorkCover(
  workId: string,
  url: string,
  source: "openlibrary" | "googlebooks",
  needsReview: boolean,
): Promise<boolean> {
  const stored = await downloadCover(withNoDefault(url), workId);
  if (!stored) return false;
  await db
    .update(works)
    .set({ coverUrl: stored, coverSource: source, coverNeedsReview: needsReview })
    .where(eq(works.id, workId));
  return true;
}
