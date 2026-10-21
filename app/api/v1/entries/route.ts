import { ApiError, json, optionalDate, readObject, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import { addOpenLibraryBook, AddBookError } from "@/lib/books/add";
import { addFromCatalogue, comicBook, hardcoverBook } from "@/lib/books/add-from-catalogue";
import { readBookDraftJson, type BookDraft } from "@/lib/books/draft";
import { editionExists } from "@/lib/books/entries";
import { entryDetail } from "@/lib/books/read";
import { shelveEdition } from "@/lib/books/shelving";
import { comicvineEnabled } from "@/lib/comicvine";
import { db } from "@/lib/db";
import { hardcoverEnabled } from "@/lib/hardcover";
import { parseIsbn } from "@/lib/isbn";
import { isEditionKey, isWorkKey, OpenLibraryError } from "@/lib/openlibrary";
import { isShelf, type Shelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

type Format = "book" | "audiobook";

function formatFrom(body: Record<string, unknown>): Format {
  if (body.format === undefined) return "book";
  if (body.format === "book" || body.format === "audiobook") return body.format;
  throw new ApiError("invalid", "format is book or audiobook.", { fields: { format: "Unknown format." } });
}

/** A catalogue's id for something: a positive whole number Postgres can store. */
function catalogueId(value: unknown, name: string): number {
  if (Number.isInteger(value) && (value as number) > 0 && (value as number) < 2_147_483_648) return value as number;
  throw new ApiError("invalid", `${name} must be a positive whole number.`, { fields: { [name]: "Invalid." } });
}

function optionalText(value: unknown, name: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError("invalid", `${name} must be text.`, { fields: { [name]: "Invalid." } });
  return value.trim().slice(0, max) || null;
}

function openLibraryFailure(error: OpenLibraryError): ApiError {
  return error.status === 429
    ? new ApiError("rate_limited", "Open Library is busy. Nothing was added; try again in a moment.", {
        retryAfterSeconds: 30,
      })
    : new ApiError("upstream", `${error.message}. Nothing was added; try again in a moment.`);
}

/** Open Library's work, and the edition chosen from GET /catalogue/openlibrary/{key}, or "any edition". */
/** `details`, the catalogue route's, edited: what a book not here yet is saved with. */
function draftFrom(body: Record<string, unknown>): BookDraft | undefined {
  if (body.details === undefined || body.details === null) return undefined;
  if (typeof body.details !== "object" || Array.isArray(body.details)) {
    throw new ApiError("invalid", "details must be an object.", { fields: { details: "Invalid." } });
  }
  const read = readBookDraftJson(body.details as Record<string, unknown>);
  if (!read.ok) throw new ApiError("invalid", read.error, { fields: { details: read.error } });
  return read.draft;
}

async function addFromOpenLibrary(userId: string, body: Record<string, unknown>, shelf: Shelf, on: string | undefined) {
  const olWorkKey = body.olWorkKey;
  if (typeof olWorkKey !== "string" || !isWorkKey(olWorkKey)) {
    throw new ApiError("invalid", "olWorkKey is an Open Library work key, like OL45804W.", {
      fields: { olWorkKey: "Invalid." },
    });
  }
  const olEditionKey = body.olEditionKey ?? null;
  if (olEditionKey !== null && (typeof olEditionKey !== "string" || !isEditionKey(olEditionKey))) {
    throw new ApiError("invalid", "olEditionKey is an Open Library edition key, like OL7353617M.", {
      fields: { olEditionKey: "Invalid." },
    });
  }
  const format = formatFrom(body);
  const audio = format === "audiobook";

  let durationMinutes: number | null = null;
  if (body.durationMinutes !== undefined && body.durationMinutes !== null) {
    if (!Number.isInteger(body.durationMinutes) || (body.durationMinutes as number) < 0) {
      throw new ApiError("invalid", "durationMinutes must be a whole number of minutes.", {
        fields: { durationMinutes: "Invalid." },
      });
    }
    durationMinutes = (body.durationMinutes as number) || null;
  }
  const isbn = parseIsbn(optionalText(body.isbn, "isbn", 40) ?? "");

  try {
    return await addOpenLibraryBook({
      userId,
      olWorkKey,
      olEditionKey,
      format,
      shelf,
      credit: audio ? optionalText(body.credit, "credit", 200) : null,
      durationMinutes: audio ? durationMinutes : null,
      isbn: isbn.kind === "isbn" ? isbn.isbn : null,
      on,
      draft: draftFrom(body),
    });
  } catch (error) {
    if (error instanceof AddBookError) throw new ApiError("invalid", error.message);
    if (error instanceof OpenLibraryError) throw openLibraryFailure(error);
    throw error;
  }
}

/**
 * Puts a book on your shelf, from any half of search:
 *
 * - `{ editionId, shelf? }` for an edition already on this server.
 * - `{ olWorkKey, olEditionKey?, format?, credit?, durationMinutes?, isbn?, shelf? }`
 *   for Open Library: the edition picked from `/catalogue/openlibrary/{key}`,
 *   or none for "any edition", a plain Book or Audiobook. `credit` and
 *   `durationMinutes` count only for an audiobook.
 * - `{ hardcoverId, format?, shelf? }` for a book only Hardcover has.
 * - `{ comicvineIssueId, shelf? }` for a comic or graphic novel.
 *
 * Each catalogue add takes `details?` (`title`, `subtitle`, `authors`,
 * `authorSort`, `firstPublishedYear`, `summary`, `series: { name, position }`
 * or null), as its catalogue route gives them, edited: a book not here yet is
 * saved with them; one already here ignores them.
 *
 * The same lib code as the web's add pages, so the same rules: the shelf's
 * read rules apply, `format` defaults to book. `finishedOn` sets the day of
 * the read a Finished add records (today if left out), so a run of comics
 * read last summer can be added issue by issue with that day. 201 when added, 200 when it
 * was already there; an entry already on the shelf keeps its shelf.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);

  let shelf: Shelf = "tbr";
  if (body.shelf !== undefined) {
    if (!isShelf(body.shelf)) {
      throw new ApiError("invalid", "Not one of the shelves /meta lists.", {
        fields: { shelf: "Unknown shelf." },
      });
    }
    shelf = body.shelf;
  }
  const finishedOn = optionalDate(body.finishedOn, "finishedOn");
  const on = shelf === "finished" ? finishedOn : undefined;

  let entryId: string;
  let added: boolean;
  let editionId: string;

  if (body.editionId !== undefined) {
    const id = body.editionId;
    if (typeof id !== "string" || !isUuid(id) || !(await editionExists(id))) {
      throw new ApiError("not_found", "No such edition.");
    }
    editionId = id;
    ({ entryId, added } = await db.transaction((tx) => shelveEdition(tx, user.id, id, shelf, on)));
  } else if (body.olWorkKey !== undefined) {
    ({ editionId, entryId, added } = await addFromOpenLibrary(user.id, body, shelf, on));
  } else if (body.hardcoverId !== undefined) {
    const id = catalogueId(body.hardcoverId, "hardcoverId");
    const format = formatFrom(body);
    const draft = draftFrom(body);
    if (!hardcoverEnabled()) throw new ApiError("upstream", "This server has no Hardcover token.");
    const book = await hardcoverBook(id);
    if (!book) throw new ApiError("upstream", "Hardcover did not answer, or has no such book. Nothing was added.");
    ({ editionId, entryId, added } = await addFromCatalogue({ userId: user.id, book, format, shelf, on, draft }));
  } else if (body.comicvineIssueId !== undefined) {
    const id = catalogueId(body.comicvineIssueId, "comicvineIssueId");
    const draft = draftFrom(body);
    if (!comicvineEnabled()) throw new ApiError("upstream", "This server has no Comic Vine key.");
    const book = await comicBook(id);
    if (!book) throw new ApiError("upstream", "Comic Vine did not answer, or has no such issue. Nothing was added.");
    ({ editionId, entryId, added } = await addFromCatalogue({ userId: user.id, book, format: "book", shelf, on, draft }));
  } else {
    throw new ApiError("invalid", "Send an editionId, olWorkKey, hardcoverId or comicvineIssueId.", {
      fields: {
        editionId: "One of these is required.",
        olWorkKey: "One of these is required.",
        hardcoverId: "One of these is required.",
        comicvineIssueId: "One of these is required.",
      },
    });
  }

  refreshEntryPages(editionId);
  const detail = await entryDetail(user.id, entryId);
  if (!detail) throw new ApiError("internal", "The entry could not be read back.");
  return json(entryJson(detail), { status: added ? 201 : 200 });
});
