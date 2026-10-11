import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";
import { slugify } from "@/lib/slug";

import { ensurePlainEdition } from "./add";
import { setCover } from "./covers";
import { setWorkSeries } from "./series";
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
  series: { name: string; position: number | null } | null;
  coverUrl: string | null;
  coverSource: "hardcover" | "comicvine";
  /** A Hardcover book is a local work with details filled in (§4b); a comic is Comic Vine's. */
  source: "local" | "comicvine";
};

export type CatalogueAddResult = { entryId: string; added: boolean };

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
      if (book.series) await setWorkSeries(tx, workId, book.series.name, book.series.position, input.userId);
    }

    const edition = await ensurePlainEdition(
      tx,
      { userId: input.userId, format: input.format, credit: null, durationMinutes: null, isbn: null },
      workId,
    );
    const shelved = await shelveEdition(tx, input.userId, edition.id, input.shelf);
    return { workId, created, ...shelved };
  });

  if (outcome.created && book.coverUrl) {
    const stored = await downloadCover(book.coverUrl);
    if (stored.ok) await setCover({ kind: "work", id: outcome.workId }, stored.path, book.coverSource, false);
  }
  return { entryId: outcome.entryId, added: outcome.added };
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
