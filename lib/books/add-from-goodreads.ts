import { and, eq, isNull } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";
import { lookUpPlacedCovers, placeBook, planBook, type GoodreadsBook, type Plan } from "@/lib/import/run";
import { parseIsbn } from "@/lib/isbn";
import { OpenLibraryError } from "@/lib/openlibrary";
import type { Shelf } from "@/lib/shelves";

import { setCover } from "./covers";
import { applyBookDraft, type BookDraft } from "./draft";
import { findEditionTarget, type GoodreadsTarget } from "./goodreads-fill";
import { parsePosition } from "./series";
import { shelveEdition } from "./shelving";
import { titleQueries } from "./titles";

/**
 * Adding a book from its own Goodreads page (the Firefox extension, and the
 * bookmarklet on a book no edition is linked to). The page only says what the
 * book is; where it goes is the Goodreads import's rule (lib/import/run): an
 * edition here with its ISBN, else Open Library by ISBN, then by title and
 * author strictly, then Hardcover, else a book of its own. The details the
 * add form shows are the page's, since that is what the person is looking at.
 */

export type GoodreadsMatch = "here" | "isbn" | "title" | "hardcover" | "local";

export type GoodreadsAddPreview =
  /** One of your editions has the page's ISBN: fill it in instead. */
  | { kind: "shelved"; target: GoodreadsTarget }
  | { kind: "add"; match: GoodreadsMatch; workTitle: string | null; draft: BookDraft | null }
  | { kind: "error"; error: string };

function bookFrom(data: GoodreadsPageData): GoodreadsBook | null {
  if (!data.title) return null;
  const isbn = data.isbn ? parseIsbn(data.isbn) : null;
  return {
    bookId: data.goodreadsId,
    title: data.title,
    authors: data.authors ?? [],
    isbn13: isbn?.kind === "isbn" ? isbn.isbn.isbn13 : null,
    isbn10: isbn?.kind === "isbn" ? isbn.isbn.isbn10 : null,
    year: data.year,
  };
}

function matchOf(decided: Plan): GoodreadsMatch {
  if (decided.kind === "edition") return "here";
  if (decided.kind === "openlibrary") return decided.matchedBy;
  return decided.edition ? "isbn" : decided.hardcover ? "hardcover" : "local";
}

/** The page's details as a new work's, the catalogue's filling what it lacks. */
function draftFrom(data: GoodreadsPageData, book: GoodreadsBook, decided: Plan): BookDraft {
  const fetched = decided.kind === "openlibrary" && "fetch" in decided.work ? decided.work.fetch : null;
  const hardcover = decided.kind === "local" ? decided.hardcover : null;
  const position = data.position ? parsePosition(data.position) : null;
  return {
    title: titleQueries(book.title).match[0] ?? book.title,
    subtitle: null,
    authors: book.authors.length ? book.authors : (fetched?.summary.authors ?? hardcover?.authors ?? []),
    authorSort: null,
    firstPublishedYear: data.year ?? fetched?.summary.firstPublishedYear ?? hardcover?.releaseYear ?? null,
    summary: data.description ?? fetched?.record.summary ?? hardcover?.description ?? null,
    series: data.series
      ? { name: data.series, position: position === "invalid" ? null : position }
      : (hardcover?.series ?? null),
  };
}

/** Where the page's book would go, and the details to look over. Writes nothing. */
export async function previewGoodreadsAdd(userId: string, data: GoodreadsPageData): Promise<GoodreadsAddPreview> {
  const book = bookFrom(data);
  if (!book) return { kind: "error", error: "That Goodreads page did not say what the book is called." };

  let decided: Plan;
  try {
    decided = await planBook(book);
  } catch (error) {
    if (error instanceof OpenLibraryError) return { kind: "error", error: `${error.message}. Try again in a moment.` };
    throw error;
  }

  if (decided.kind === "edition") {
    const target = await findEditionTarget(userId, decided.editionId);
    if (target) return { kind: "shelved", target };
  }
  const workId = decided.kind === "edition" ? decided.workId : decided.kind === "openlibrary" && "knownId" in decided.work ? decided.work.knownId : null;
  if (workId) {
    const [work] = await db.select({ title: works.title }).from(works).where(eq(works.id, workId));
    return { kind: "add", match: matchOf(decided), workTitle: work?.title ?? null, draft: null };
  }
  return { kind: "add", match: matchOf(decided), workTitle: null, draft: draftFrom(data, book, decided) };
}

/**
 * Adds the page's book: found as the preview found it (asked again, not
 * trusted from the form), the draft applied only to a work this makes, the
 * edition linked to the page, and the page's cover on a new edition — it is
 * that edition's own art, so no lookup is needed for it.
 */
export async function addGoodreadsBook(input: {
  userId: string;
  data: GoodreadsPageData;
  format: "book" | "audiobook";
  shelf: Shelf;
  draft?: BookDraft;
}): Promise<{ editionId: string; entryId: string; added: boolean } | { error: string }> {
  const book = bookFrom(input.data);
  if (!book) return { error: "That Goodreads page did not say what the book is called." };

  let decided: Plan;
  try {
    decided = await planBook(book);
  } catch (error) {
    if (error instanceof OpenLibraryError) return { error: `${error.message}. Nothing was added; try again in a moment.` };
    throw error;
  }

  const outcome = await db.transaction(async (tx) => {
    const placed = await placeBook(tx, input.userId, decided, { ...book, format: input.format });
    await tx
      .update(editions)
      .set({ goodreadsBookId: book.bookId })
      .where(and(eq(editions.id, placed.editionId), isNull(editions.goodreadsBookId)));
    if (placed.work.created && input.draft) await applyBookDraft(tx, placed.work.id, input.draft, input.userId);
    const shelved = await shelveEdition(tx, input.userId, placed.editionId, input.shelf);
    return { placed, ...shelved };
  });

  let pageCover = false;
  if (outcome.placed.editionCreated && input.data.coverUrl) {
    const stored = await downloadCover(input.data.coverUrl);
    if (stored.ok) {
      await setCover({ kind: "edition", id: outcome.placed.editionId }, stored.path, "url", false);
      pageCover = true;
    }
  }
  await lookUpPlacedCovers(decided, book, outcome.placed, { editionCover: !pageCover });

  return { editionId: outcome.placed.editionId, entryId: outcome.entryId, added: outcome.added };
}
