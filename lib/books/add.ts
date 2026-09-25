import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { parseIsbn, type Isbn } from "@/lib/isbn";
import { getEdition, type OlEditionSummary } from "@/lib/openlibrary";
import type { Shelf } from "@/lib/shelves";

import { lookUpCoversOnAdd } from "./covers-on-add";
import { editionNameFor, plainEditionName } from "./edition-name";
import { shelveEdition } from "./shelving";
import {
  AddBookError,
  fetchOpenLibraryWork,
  insertOpenLibraryWork,
  type Tx,
  type WorkFetch,
} from "./works";

export { AddBookError };

export type AddBookInput = {
  userId: string;
  olWorkKey: string;
  /** Null means "any edition": a plain one named Book or Audiobook. */
  olEditionKey: string | null;
  format: "book" | "audiobook";
  shelf: Shelf;
  /** Audiobooks only: "Read by". */
  credit: string | null;
  durationMinutes: number | null;
  /** The ISBN that led here, when one did — preferred over the record's first. */
  isbn: Isbn | null;
};

export type AddBookResult = {
  workId: string;
  editionId: string;
  entryId: string;
  /** False when this edition was already on the shelf; nothing was changed. */
  added: boolean;
};

/**
 * Adds an Open Library book to someone's shelf: the work, the edition and the
 * entry, in one transaction. Shared by the add form and, later, the Goodreads
 * import.
 *
 * Everything that needs the network happens before the transaction opens or
 * after it commits. A transaction held open across a one-a-second request queue
 * would hold locks for seconds, and a cover that fails to download must not
 * roll back an otherwise correct shelf row.
 */
export async function addOpenLibraryBook(input: AddBookInput): Promise<AddBookResult> {
  const [knownWork] = await db
    .select({ id: works.id })
    .from(works)
    .where(eq(works.olWorkKey, input.olWorkKey));

  const [knownEdition] = input.olEditionKey
    ? await db
        .select({ id: editions.id, workId: editions.workId })
        .from(editions)
        .where(eq(editions.olEditionKey, input.olEditionKey))
    : [];

  // Only fetch what is not already here: once a work is cached, adding another
  // of its editions — or the same book on a second account — costs one request
  // or none.
  const workFetch: WorkFetch | null = knownWork ? null : await fetchOpenLibraryWork(input.olWorkKey);

  let editionFetch: OlEditionSummary | null = null;
  if (input.olEditionKey && !knownEdition) {
    editionFetch = await getEdition(input.olEditionKey);
    if (!editionFetch) throw new AddBookError("Open Library no longer has that edition.");
    // The key comes from a form, so it is checked against the work rather than
    // believed: an edition of a different book would file it under this one.
    if (editionFetch.olWorkKey !== input.olWorkKey) {
      throw new AddBookError("That edition belongs to a different work.");
    }
  }
  // A stored edition whose work is not this one — including when this work is
  // not stored at all, since the edition's own work necessarily is.
  if (knownEdition && knownEdition.workId !== knownWork?.id) {
    throw new AddBookError("That edition belongs to a different work.");
  }

  const outcome = await db.transaction(async (tx) => {
    const work = workFetch
      ? await insertOpenLibraryWork(tx, workFetch, input.userId)
      : { id: knownWork.id, created: false };

    const edition = knownEdition
      ? { id: knownEdition.id, created: false, isbn13: null }
      : editionFetch
        ? await insertOpenLibraryEdition(tx, input, work.id, editionFetch)
        : await ensurePlainEdition(tx, input, work.id);

    const { entryId, added } = await shelveEdition(tx, input.userId, edition.id, input.shelf);
    return { work, edition, entryId, added };
  });

  // Auto-lookup runs once, on add, for rows this add created. It never re-runs
  // on its own, so art someone approved is never silently replaced (§4a).
  if (outcome.work.created || outcome.edition.created) {
    await lookUpCoversOnAdd({
      work:
        outcome.work.created && workFetch
          ? {
              id: outcome.work.id,
              title: workFetch.summary.title,
              firstAuthor: workFetch.summary.authors[0] ?? null,
              coverId: workFetch.record.coverId ?? workFetch.summary.coverId,
            }
          : null,
      workId: outcome.work.id,
      edition: outcome.edition.created
        ? {
            id: outcome.edition.id,
            coverId: editionFetch?.coverId ?? null,
            isbn13: outcome.edition.isbn13,
          }
        : null,
    });
  }

  return {
    workId: outcome.work.id,
    editionId: outcome.edition.id,
    entryId: outcome.entryId,
    added: outcome.added,
  };
}

type EnsuredEdition = { id: string; created: boolean; isbn13: string | null };

/** What creating an edition needs from the add, shared with the Goodreads import. */
export type EditionInput = Pick<AddBookInput, "userId" | "format" | "credit" | "durationMinutes" | "isbn">;

export async function insertOpenLibraryEdition(
  tx: Tx,
  input: EditionInput,
  workId: string,
  edition: OlEditionSummary,
): Promise<EnsuredEdition> {
  const audio = input.format === "audiobook";
  // Both forms from whichever the record has: a 978 ISBN-13 has exactly one
  // ISBN-10 and the reverse, so this is arithmetic, not a guess — and it lets a
  // later search by either find the edition locally.
  const parsed = parseIsbn(input.isbn?.isbn13 ?? edition.isbn13 ?? edition.isbn10 ?? "");
  const isbn = parsed.kind === "isbn" ? parsed.isbn : null;
  const isbn13 = isbn?.isbn13 ?? null;

  const [created] = await tx
    .insert(editions)
    .values({
      workId,
      name: editionNameFor(edition, input.format),
      kind: "original",
      // The toggle, not Open Library's physical_format: their format data is
      // often wrong or missing, and the person adding it knows what they read.
      format: input.format,
      language: edition.language,
      publisher: edition.publisher,
      publishedOn: edition.publishedOn,
      pages: edition.pages,
      durationMinutes: audio ? input.durationMinutes : null,
      isbn13,
      isbn10: isbn?.isbn10 ?? null,
      credit: audio ? input.credit : null,
      olEditionKey: edition.olEditionKey,
      source: "openlibrary",
      createdBy: input.userId,
    })
    .onConflictDoNothing({ target: editions.olEditionKey })
    .returning({ id: editions.id });

  if (created) return { id: created.id, created: true, isbn13 };

  const [existing] = await tx
    .select({ id: editions.id })
    .from(editions)
    .where(eq(editions.olEditionKey, edition.olEditionKey));
  return { id: existing.id, created: false, isbn13 };
}

/**
 * "Any edition": one plain Book and one plain Audiobook per work, shared, so
 * adding the same work twice does not grow a pile of identical editions.
 */
export async function ensurePlainEdition(
  tx: Tx,
  input: EditionInput,
  workId: string,
): Promise<EnsuredEdition> {
  const name = plainEditionName(input.format);
  const [existing] = await tx
    .select({ id: editions.id })
    .from(editions)
    .where(
      and(
        eq(editions.workId, workId),
        eq(editions.kind, "original"),
        eq(editions.format, input.format),
        eq(editions.name, name),
        isNull(editions.olEditionKey),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false, isbn13: null };

  const audio = input.format === "audiobook";
  const [created] = await tx
    .insert(editions)
    .values({
      workId,
      name,
      kind: "original",
      format: input.format,
      credit: audio ? input.credit : null,
      durationMinutes: audio ? input.durationMinutes : null,
      // Written here, not fetched: 'local' rows are never overwritten by a
      // refresh from Open Library.
      source: "local",
      createdBy: input.userId,
    })
    .returning({ id: editions.id });
  return { id: created.id, created: true, isbn13: null };
}
