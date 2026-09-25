import { eq } from "drizzle-orm";

import { deleteCover, downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, works } from "@/lib/db/schema";
import { coverByIsbn, coverByTitle } from "@/lib/googlebooks";
import { coverUrl, getEdition, getWorkRecord } from "@/lib/openlibrary";

type ArtSource = "openlibrary" | "googlebooks" | "url" | "upload";
export type CoverTarget = { kind: "work" | "edition"; id: string };

/**
 * Points a work or edition at a stored cover — or at none — and deletes the
 * file it replaces. Every way a cover changes goes through here, so no file is
 * left behind by any of them.
 */
export async function setCover(
  target: CoverTarget,
  path: string | null,
  source: ArtSource | null,
  needsReview: boolean,
  googleVolumeId?: string,
): Promise<void> {
  const table = target.kind === "work" ? works : editions;
  const [previous] = await db.select({ coverUrl: table.coverUrl }).from(table).where(eq(table.id, target.id));

  const values = { coverUrl: path, coverSource: source, coverNeedsReview: needsReview };
  if (target.kind === "work") {
    await db.update(works).set(values).where(eq(works.id, target.id));
  } else {
    await db
      .update(editions)
      .set({ ...values, ...(googleVolumeId ? { googleVolumeId } : {}) })
      .where(eq(editions.id, target.id));
  }

  if (previous?.coverUrl && previous.coverUrl !== path) await deleteCover(previous.coverUrl);
}

// ?default=false makes a missing Open Library cover a 404 instead of a 43-byte gif.
function withNoDefault(url: string): string {
  return url.includes("covers.openlibrary.org") ? `${url}?default=false` : url;
}

/** Downloads and applies; false when the download came to nothing. */
async function apply(
  target: CoverTarget,
  url: string,
  source: "openlibrary" | "googlebooks",
  needsReview: boolean,
  googleVolumeId?: string,
): Promise<boolean> {
  const stored = await downloadCover(withNoDefault(url));
  if (!stored.ok) return false;
  await setCover(target, stored.path, source, needsReview, googleVolumeId);
  return true;
}

type LookupTarget = {
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
 * Only for official editions. Fan translations never inherit a cover and
 * never get one guessed for them: own art, uploaded, or the placeholder.
 */
export async function lookUpCoversOnAdd(target: LookupTarget): Promise<void> {
  let editionHasCover = false;
  let workHasCover = false;

  if (target.edition?.coverId) {
    editionHasCover = await apply(
      { kind: "edition", id: target.edition.id },
      coverUrl(target.edition.coverId, "L"),
      "openlibrary",
      false,
    );
  }

  if (target.work?.coverId) {
    workHasCover = await apply({ kind: "work", id: target.work.id }, coverUrl(target.work.coverId, "L"), "openlibrary", false);
  }

  // A work this add did not create may already have art; if so, the edition
  // is already covered and Google is not asked.
  if (!target.work && !editionHasCover) {
    const [existing] = await db.select({ coverUrl: works.coverUrl }).from(works).where(eq(works.id, target.workId));
    workHasCover = Boolean(existing?.coverUrl);
  }

  if (editionHasCover || workHasCover) return;

  if (target.edition?.isbn13) {
    const found = await coverByIsbn(target.edition.isbn13);
    if (found && (await apply({ kind: "edition", id: target.edition.id }, found.url, "googlebooks", false, found.volumeId))) {
      return;
    }
  }

  if (target.work) {
    const found = await coverByTitle(target.work.title, target.work.firstAuthor);
    if (found) await apply({ kind: "work", id: target.work.id }, found.url, "googlebooks", true);
  }
}

/**
 * "Look it up again" — the manual refresh (§4a: auto-lookup never re-runs on
 * its own). The same order as on add, for one row: Open Library first, then
 * Google by ISBN for an edition or by title for a work. Replaces the current
 * cover only when it finds one; a miss leaves what is there alone.
 */
export async function refreshCover(target: CoverTarget): Promise<"found" | "none" | "not-for-fan-translations"> {
  if (target.kind === "edition") {
    const [edition] = await db
      .select({ kind: editions.kind, olEditionKey: editions.olEditionKey, isbn13: editions.isbn13 })
      .from(editions)
      .where(eq(editions.id, target.id));
    if (!edition) return "none";
    if ((COMMUNITY_EDITION_KINDS as readonly string[]).includes(edition.kind)) return "not-for-fan-translations";

    const ol = edition.olEditionKey ? await getEdition(edition.olEditionKey) : null;
    if (ol?.coverId && (await apply(target, coverUrl(ol.coverId, "L"), "openlibrary", false))) return "found";
    if (edition.isbn13) {
      const found = await coverByIsbn(edition.isbn13);
      if (found && (await apply(target, found.url, "googlebooks", false, found.volumeId))) return "found";
    }
    return "none";
  }

  const [work] = await db
    .select({ olWorkKey: works.olWorkKey, title: works.title, authors: works.authors })
    .from(works)
    .where(eq(works.id, target.id));
  if (!work) return "none";

  const record = work.olWorkKey ? await getWorkRecord(work.olWorkKey) : null;
  if (record?.coverId && (await apply(target, coverUrl(record.coverId, "L"), "openlibrary", false))) return "found";
  const found = await coverByTitle(work.title, work.authors[0] ?? null);
  if (found && (await apply(target, found.url, "googlebooks", true))) return "found";
  return "none";
}
