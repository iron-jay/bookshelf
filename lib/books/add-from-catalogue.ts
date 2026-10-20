import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { comicTitle, getIssue, getVolume, type ComicVolume } from "@/lib/comicvine";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { getBook } from "@/lib/hardcover";
import type { Shelf } from "@/lib/shelves";
import { slugify } from "@/lib/slug";

import { ensurePlainEdition } from "./add";
import { setCover } from "./covers";
import { recordRun, runSeries, type RunVolume } from "./runs";
import { parsePosition, setWorkSeries } from "./series";
import { shelveEdition } from "./shelving";

/**
 * A book from a catalogue other than Open Library, as the add pages hand it
 * over: Hardcover's books (in search beside Open Library's) and Comic Vine's
 * issues (comics and graphic novels). Everything here came from the
 * catalogue's own answer, fetched by id on the server.
 */
export type CatalogueBook = {
  /** How the work is found again, so adding it twice finds the first. */
  key: { hardcoverId: number } | { comicvineIssueId: number };
  title: string;
  subtitle: string | null;
  authors: string[];
  summary: string | null;
  year: number | null;
  series: {
    name: string;
    position: number | null;
    /** A comic run: its Comic Vine volume and issue count, so a run read to the end folds into one tile. */
    run?: RunVolume;
  } | null;
  coverUrl: string | null;
  coverSource: "hardcover" | "comicvine";
  /** The book's page on the catalogue, kept as its edition's link — Comic Vine asks for one back. */
  pageUrl: string | null;
  /** A Hardcover book is a local work with details filled in (§4b); a comic is Comic Vine's. */
  source: "local" | "comicvine";
};

export type CatalogueAddResult = { editionId: string; entryId: string; added: boolean };

/**
 * The work (found, or created from the book), its plain Book or Audiobook
 * edition, and your entry — one transaction, as the Open Library add is. The
 * cover is downloaded after commit, only for a work this add created: art
 * already on a work here is never replaced by an add (§4a).
 */
export async function addFromCatalogue(input: {
  userId: string;
  book: CatalogueBook;
  format: "book" | "audiobook";
  shelf: Shelf;
  /** The day its read starts or finishes, for a book landing on Reading or Finished; today if not given. */
  on?: string;
}): Promise<CatalogueAddResult> {
  const { book } = input;
  const match =
    "hardcoverId" in book.key
      ? eq(works.hardcoverId, book.key.hardcoverId)
      : eq(works.comicvineIssueId, book.key.comicvineIssueId);

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: works.id }).from(works).where(match).limit(1);
    let workId = existing?.id;
    const created = !workId;

    if (!workId) {
      workId = randomUUID();
      const base = slugify(book.title);
      const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
      await tx.insert(works).values({
        id: workId,
        slug: clash ? `${base}-${workId.slice(0, 8)}` : base,
        title: book.title.slice(0, 500),
        subtitle: book.subtitle?.slice(0, 500) ?? null,
        authors: book.authors.slice(0, 20),
        authorSort: authorSortFor(book.authors[0]),
        summary: book.summary?.slice(0, 20_000) ?? null,
        firstPublishedYear: book.year,
        ...book.key,
        source: book.source,
        createdBy: input.userId,
      });
      if (book.series?.run) {
        const seriesId = await runSeries(tx, book.series.name, book.series.run, input.userId);
        await tx.update(works).set({ seriesId, seriesPosition: book.series.position }).where(eq(works.id, workId));
      } else if (book.series) {
        await setWorkSeries(tx, workId, book.series.name, book.series.position, input.userId);
      }
    }
    // A new work's series was counted as it joined; one already here may
    // have gained issues on Comic Vine since.
    if (!created && book.series?.run) await recordRun(tx, workId, book.series.run);

    const edition = await ensurePlainEdition(
      tx,
      { userId: input.userId, format: input.format, credit: null, durationMinutes: null, isbn: null },
      workId,
    );
    if (book.pageUrl) {
      await tx
        .update(editions)
        .set({ url: book.pageUrl })
        .where(and(eq(editions.id, edition.id), isNull(editions.url)));
    }
    const shelved = await shelveEdition(tx, input.userId, edition.id, input.shelf, input.on);
    return { workId, created, editionId: edition.id, ...shelved };
  });

  if (outcome.created && book.coverUrl) {
    const stored = await downloadCover(book.coverUrl);
    if (stored.ok) await setCover({ kind: "work", id: outcome.workId }, stored.path, book.coverSource, false);
  }
  return { editionId: outcome.editionId, entryId: outcome.entryId, added: outcome.added };
}

/** Whether you already have this catalogue book on your shelf, in any edition — for the add page to say so. */
export async function shelvedEntryFor(
  userId: string,
  key: CatalogueBook["key"],
): Promise<{ editionId: string; workSlug: string } | null> {
  const match = "hardcoverId" in key ? eq(works.hardcoverId, key.hardcoverId) : eq(works.comicvineIssueId, key.comicvineIssueId);
  const [row] = await db
    .select({ editionId: editions.id, workSlug: works.slug })
    .from(works)
    .innerJoin(editions, eq(editions.workId, works.id))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(match)
    .limit(1);
  return row ?? null;
}

/**
 * A book only Hardcover has (§4b), from Hardcover's own answer for its id. It
 * becomes a local work with those details, as the import makes one. Null when
 * Hardcover did not answer, or has no such book.
 */
export async function hardcoverBook(id: number): Promise<CatalogueBook | null> {
  const book = await getBook(id);
  if (!book) return null;

  // Hardcover often repeats the end of the title as the subtitle.
  const subtitle = book.subtitle && !book.title.toLowerCase().endsWith(book.subtitle.toLowerCase()) ? book.subtitle : null;
  return {
    key: { hardcoverId: book.id },
    title: book.title,
    subtitle,
    authors: book.authors,
    summary: book.description,
    year: book.releaseYear,
    series: book.series,
    coverUrl: book.imageUrl,
    coverSource: "hardcover",
    pageUrl: null,
    source: "local",
  };
}

/**
 * A comic or graphic novel from Comic Vine (§4c): one issue, which may be a
 * single issue, a trade paperback or a graphic novel. Its volume is its series
 * when the volume has more than one issue, numbered by the issue.
 */
export async function comicBook(issueId: number, knownVolume?: ComicVolume): Promise<CatalogueBook | null> {
  const issue = await getIssue(issueId);
  // Adding a run passes its volume once rather than asking again per issue,
  // which halves the requests against Comic Vine's hourly allowance.
  const volume =
    issue?.volume && knownVolume?.id === issue.volume.id
      ? knownVolume
      : issue?.volume
        ? await getVolume(issue.volume.id)
        : null;
  if (!issue || !volume) return null;

  const position = issue.issueNumber ? parsePosition(issue.issueNumber) : null;
  return {
    key: { comicvineIssueId: issue.id },
    title: comicTitle(volume.name, issue, volume.issueCount),
    subtitle: null,
    authors: issue.authors,
    summary: issue.description,
    year: issue.year,
    series:
      volume.issueCount > 1
        ? {
            name: volume.name,
            position: typeof position === "number" ? position : null,
            run: { comicvineVolumeId: volume.id, issueCount: volume.issueCount, startYear: volume.startYear },
          }
        : null,
    coverUrl: issue.coverUrl,
    coverSource: "comicvine",
    // Comic Vine's own address for it, from its answer; only on its host.
    pageUrl: issue.pageUrl && /^https:\/\/comicvine\.gamespot\.com\//.test(issue.pageUrl) ? issue.pageUrl : null,
    source: "comicvine",
  };
}
