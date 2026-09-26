import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { coverCandidates, coverUrlForVolume } from "@/lib/googlebooks";
import { searchBooks, type HardcoverBook } from "@/lib/hardcover";
import { coverUrl, getEdition, getEditions, getWorkRecord, searchWorks } from "@/lib/openlibrary";

import { shareAnAuthor, titleQueries } from "./titles";

import type { CoverTarget } from "./covers";

/**
 * One cover the picker can offer. `ref` is what comes back when it is chosen:
 * an Open Library cover id or a Google volume id — never an address, so the
 * server builds the URL it downloads and a page cannot point it anywhere.
 */
export type CoverCandidate = {
  source: "openlibrary" | "googlebooks" | "hardcover";
  ref: string;
  thumb: string;
  /** Where it came from, shown under the thumbnail. */
  label: string;
};

const MAX = 36;
/** Other editions can number in the hundreds; they get a share, not the grid. */
const OTHER_EDITIONS = 16;

function fromOl(ids: number[], label: string): CoverCandidate[] {
  return ids.filter((id) => id > 0).map((id) => ({ source: "openlibrary", ref: String(id), thumb: coverUrl(id, "M"), label }));
}

/** Hardcover hits with art, this book's author first — a person picks, so the rest stay. */
function fromHardcover(books: HardcoverBook[], authors: string[]): CoverCandidate[] {
  return books
    .filter((b) => b.imageUrl)
    .sort((a, b) => Number(shareAnAuthor(b.authors, authors)) - Number(shareAnAuthor(a.authors, authors)))
    .map((b) => ({ source: "hardcover" as const, ref: String(b.id), thumb: b.imageUrl ?? "", label: `Hardcover: ${b.title}` }));
}

function dedupe(candidates: CoverCandidate[]): CoverCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      const key = `${c.source}:${c.ref}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX);
}

/**
 * The covers the lookups can see for a work or edition, most specific first:
 * the edition's own, the work's, its other editions' (where alternate
 * printings and audiobook art usually are), then Google by ISBN and by title.
 * Several queued requests — this is for a person waiting on one book, not a
 * bulk path.
 */
export async function candidatesFor(target: CoverTarget): Promise<CoverCandidate[]> {
  const out: CoverCandidate[] = [];

  let workId: string;
  let isbn13: string | null = null;
  if (target.kind === "edition") {
    const [edition] = await db
      .select({ workId: editions.workId, olEditionKey: editions.olEditionKey, isbn13: editions.isbn13 })
      .from(editions)
      .where(eq(editions.id, target.id));
    if (!edition) return [];
    workId = edition.workId;
    isbn13 = edition.isbn13;
    const ol = edition.olEditionKey ? await getEdition(edition.olEditionKey) : null;
    if (ol?.coverId) out.push(...fromOl([ol.coverId], "This edition"));
  } else {
    workId = target.id;
  }

  const [work] = await db
    .select({ olWorkKey: works.olWorkKey, title: works.title, authors: works.authors })
    .from(works)
    .where(eq(works.id, workId));
  if (!work) return dedupe(out);

  if (work.olWorkKey) {
    const record = await getWorkRecord(work.olWorkKey);
    out.push(...fromOl((record?.payload.covers ?? []).filter((c): c is number => typeof c === "number"), "Open Library"));
  }

  // Google by ISBN before other editions: it is this exact edition's art.
  if (isbn13) {
    for (const g of await coverCandidates(`isbn:${isbn13}`, 3)) {
      out.push({ source: "googlebooks", ref: g.volumeId, thumb: g.url, label: "Google, by ISBN" });
    }
  }

  if (work.olWorkKey) {
    const others = await getEditions(work.olWorkKey);
    out.push(
      ...(others?.editions ?? [])
        .flatMap((e) =>
          e.coverId ? fromOl([e.coverId], [e.publisher, e.year].filter(Boolean).join(" ") || "Another edition") : [],
        )
        .slice(0, OTHER_EDITIONS),
    );
  }
  // Hardcover next: where Open Library has nothing, it usually does.
  out.push(...fromHardcover(await searchBooks(titleQueries(work.title).search[0] ?? work.title, 10), work.authors).slice(0, 8));

  const author = work.authors[0];
  const byTitle = await coverCandidates(author ? `intitle:"${work.title.replace(/"/g, "")}" inauthor:"${author.replace(/"/g, "")}"` : `intitle:"${work.title.replace(/"/g, "")}"`);
  out.push(...byTitle.map((g) => ({ source: "googlebooks" as const, ref: g.volumeId, thumb: g.url, label: g.title ? `Google: ${g.title}` : "Google" })));

  return dedupe(out);
}

/**
 * Free-text search for when the book's own title finds nothing useful.
 * Google first: for loose terms its ranking is far better — Open Library's
 * search answered "halo divine wind" with "Mesopotamian medicine" — so Open
 * Library gets only its top few, after.
 */
export async function searchCandidates(term: string): Promise<CoverCandidate[]> {
  const q = term.trim().slice(0, 200);
  if (q.length < 2) return [];
  const [google, hardcover, ol] = [await coverCandidates(q, 16), await searchBooks(q, 12), await searchWorks(q, 8)];
  return dedupe([
    ...google.map((g) => ({ source: "googlebooks" as const, ref: g.volumeId, thumb: g.url, label: g.title ? `Google: ${g.title}` : "Google" })),
    ...fromHardcover(hardcover, []),
    ...ol.flatMap((w) => (w.coverId ? fromOl([w.coverId], `Open Library: ${w.title}`) : [])),
  ]);
}

/** The address to download for a chosen candidate, built from its ref alone. */
export function candidateUrl(source: string, ref: string): string | null {
  if (source === "openlibrary") return /^\d{1,12}$/.test(ref) ? `${coverUrl(Number(ref), "L")}?default=false` : null;
  if (source === "googlebooks") return coverUrlForVolume(ref);
  return null;
}
