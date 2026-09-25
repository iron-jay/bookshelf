import { and, eq, isNull, or } from "drizzle-orm";

import { ensurePlainEdition, insertOpenLibraryEdition } from "@/lib/books/add";
import { lookUpCoversOnAdd } from "@/lib/books/covers";
import { setWorkSeries } from "@/lib/books/series";
import { ensureTag, tagEntries } from "@/lib/books/tags";
import {
  insertLocalWork,
  insertOpenLibraryWork,
  type EnsuredWork,
  type Tx,
  type WorkFetch,
} from "@/lib/books/works";
import { db } from "@/lib/db";
import { editions, entries, reads, works } from "@/lib/db/schema";
import {
  getEditionByIsbn,
  getWorkRecord,
  OpenLibraryError,
  searchWorks,
  type OlEditionSummary,
  type OlWorkSummary,
} from "@/lib/openlibrary";

import type { GoodreadsRow } from "./goodreads";

export type RowOutcome = {
  line: number;
  title: string;
  result: "added" | "already" | "failed";
  /** How the book was found. "local" means no match: it became a local work. */
  matchedBy?: "previous import" | "isbn" | "title" | "local";
  message?: string;
};

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Title search is the last resort before giving up, so it only accepts a
 * result that is plainly the same book: the same title (or one that extends it
 * with a subtitle, either way round) and a shared author surname. A wrong
 * match is worse than a local work — the local work is listed for fixing, the
 * wrong match looks right and is not.
 */
function sameBook(result: OlWorkSummary, row: GoodreadsRow): boolean {
  const a = fold(result.title);
  const b = fold(row.title);
  const titleMatch = a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
  if (!titleMatch) return false;
  if (row.authors.length === 0) return true;
  const theirs = fold(result.authors.join(" ")).split(" ");
  return row.authors.some((name) => {
    const surname = fold(name).split(" ").pop();
    return surname ? theirs.includes(surname) : false;
  });
}

type Plan =
  | { kind: "edition"; editionId: string; workId: string; matchedBy: "previous import" | "isbn" }
  | {
      kind: "openlibrary";
      matchedBy: "isbn" | "title";
      work: { knownId: string } | { fetch: WorkFetch };
      edition: OlEditionSummary | null;
    }
  | { kind: "local" };

/** Where a row's book is — decided with the network, before any write. */
async function plan(row: GoodreadsRow): Promise<Plan> {
  // 1. Imported before: re-running the same export changes nothing (§5).
  const [previous] = await db
    .select({ id: editions.id, workId: editions.workId })
    .from(editions)
    .where(eq(editions.goodreadsBookId, row.bookId))
    .limit(1);
  if (previous) return { kind: "edition", editionId: previous.id, workId: previous.workId, matchedBy: "previous import" };

  const workFor = async (olWorkKey: string, summary: (record: WorkFetch["record"]) => OlWorkSummary) => {
    const [known] = await db.select({ id: works.id }).from(works).where(eq(works.olWorkKey, olWorkKey));
    if (known) return { knownId: known.id };
    const record = await getWorkRecord(olWorkKey);
    return record ? { fetch: { olWorkKey, record, summary: summary(record) } } : null;
  };

  // 2. ISBN13, then ISBN — already here first, then Open Library.
  if (row.isbn13) {
    const [local] = await db
      .select({ id: editions.id, workId: editions.workId })
      .from(editions)
      .where(or(eq(editions.isbn13, row.isbn13), row.isbn10 ? eq(editions.isbn10, row.isbn10) : undefined))
      .limit(1);
    if (local) return { kind: "edition", editionId: local.id, workId: local.workId, matchedBy: "isbn" };

    const edition = await getEditionByIsbn(row.isbn13);
    if (edition?.olWorkKey) {
      // The export already names the authors, so the work's own record is the
      // only other request — no search for names.
      const work = await workFor(edition.olWorkKey, (record) => ({
        olWorkKey: edition.olWorkKey ?? "",
        title: typeof record.payload.title === "string" && record.payload.title.trim() ? record.payload.title.trim() : row.title,
        subtitle: null,
        authors: row.authors,
        firstPublishedYear: row.year,
        coverId: record.coverId,
        editionCount: null,
      }));
      if (work) return { kind: "openlibrary", matchedBy: "isbn", work, edition };
    }
  }

  // 3. Title and author, strictly.
  const results = await searchWorks(`${row.title} ${row.authors[0] ?? ""}`.trim(), 5);
  const match = results.find((result) => sameBook(result, row));
  if (match) {
    const work = await workFor(match.olWorkKey, () => match);
    if (work) return { kind: "openlibrary", matchedBy: "title", work, edition: null };
  }

  // 4. Nothing: a local work, listed afterwards so it can be fixed (§5).
  return { kind: "local" };
}

/**
 * Imports one Goodreads row. Idempotent: the Goodreads book id is stored on
 * the edition, and an entry already on the shelf is never overwritten — a
 * second run of the same file adds nothing and changes nothing.
 *
 * A network failure fails the row rather than filing it as a local work: "Open
 * Library was down" is not "Open Library has never heard of it". Running the
 * file again picks up exactly the rows that failed.
 */
export async function importGoodreadsRow(userId: string, row: GoodreadsRow): Promise<RowOutcome> {
  const base = { line: row.line, title: row.rawTitle };

  let decided: Plan;
  try {
    decided = await plan(row);
  } catch (error) {
    if (error instanceof OpenLibraryError) return { ...base, result: "failed", message: error.message };
    throw error;
  }

  const outcome = await db.transaction(async (tx) => {
    let work: EnsuredWork;
    let editionId: string;
    let editionCreated = false;
    let editionIsbn: string | null = null;

    if (decided.kind === "edition") {
      work = { id: decided.workId, created: false };
      editionId = decided.editionId;
    } else {
      work =
        decided.kind === "local"
          ? await insertLocalWork(tx, { title: row.title, authors: row.authors }, userId)
          : "knownId" in decided.work
            ? { id: decided.work.knownId, created: false }
            : await insertOpenLibraryWork(tx, decided.work.fetch, userId);

      const editionInput = {
        userId,
        format: row.format,
        credit: null,
        durationMinutes: null,
        isbn: row.isbn13 ? { isbn13: row.isbn13, isbn10: row.isbn10 } : null,
      };
      const edition =
        decided.kind === "openlibrary" && decided.edition
          ? await insertOpenLibraryEdition(tx, editionInput, work.id, decided.edition)
          : await ensurePlainEdition(tx, editionInput, work.id);
      editionId = edition.id;
      editionCreated = edition.created;
      editionIsbn = edition.isbn13;
    }

    // Recorded on the edition only if it has none, so the first Goodreads book
    // to reach a shared edition keeps it.
    await tx
      .update(editions)
      .set({ goodreadsBookId: row.bookId })
      .where(and(eq(editions.id, editionId), isNull(editions.goodreadsBookId)));

    // Series from the title, but never over one already set by hand.
    if (row.series) {
      const [current] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, work.id));
      if (!current?.seriesId) await setWorkSeries(tx, work.id, row.series.name, row.series.position, userId);
    }

    const added = await addEntry(tx, userId, editionId, row);
    return { work, editionId, editionCreated, editionIsbn, added };
  });

  if (outcome.work.created || outcome.editionCreated) {
    const fetched = decided.kind === "openlibrary" && "fetch" in decided.work ? decided.work.fetch : null;
    await lookUpCoversOnAdd({
      work: outcome.work.created
        ? {
            id: outcome.work.id,
            title: fetched?.summary.title ?? row.title,
            firstAuthor: row.authors[0] ?? null,
            coverId: fetched ? (fetched.record.coverId ?? fetched.summary.coverId) : null,
          }
        : null,
      workId: outcome.work.id,
      edition: outcome.editionCreated
        ? {
            id: outcome.editionId,
            coverId: decided.kind === "openlibrary" ? (decided.edition?.coverId ?? null) : null,
            isbn13: outcome.editionIsbn,
          }
        : null,
    });
  }

  return {
    ...base,
    result: outcome.added ? "added" : "already",
    matchedBy: decided.kind === "local" ? "local" : decided.matchedBy,
  };
}

/**
 * The shelf row, its reads and its tags — or nothing at all if this edition is
 * already on the shelf: what someone has changed since is theirs.
 */
async function addEntry(tx: Tx, userId: string, editionId: string, row: GoodreadsRow): Promise<boolean> {
  const [entry] = await tx
    .insert(entries)
    .values({
      userId,
      editionId,
      status: row.shelf,
      rating: row.rating,
      review: row.review,
      addedAt: row.dateAdded ? new Date(`${row.dateAdded}T12:00:00Z`) : undefined,
    })
    .onConflictDoNothing()
    .returning({ id: entries.id });
  if (!entry) return false;

  // One read with the date, plus undated reads for the rest of Read Count (§5).
  const dated = row.dateRead ? 1 : 0;
  const undated = Math.max(row.readCount - dated, 0);
  const readRows = [
    ...(row.dateRead ? [{ entryId: entry.id, finishedOn: row.dateRead }] : []),
    ...Array.from({ length: undated }, () => ({ entryId: entry.id })),
  ];
  if (readRows.length > 0) await tx.insert(reads).values(readRows);

  for (const name of row.tags) {
    await tagEntries(tx, await ensureTag(tx, userId, name), [entry.id]);
  }
  return true;
}
