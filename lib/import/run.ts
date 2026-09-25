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

const words = (text: string) => (text ? text.split(" ").length : 0);

/**
 * Whether a candidate's title — Open Library's title, alone or with its
 * subtitle — names the same book as a Goodreads title. What decides it is
 * which side is longer and where the shorter one ends:
 *
 * - Equal: yes.
 * - Open Library's is longer — it adds a subtitle ("Guards! Guards!: A
 *   Discworld Novel") or a franchise prefix ("Star Wars: Trials of the Jedi
 *   (High Republic)"): yes, if the Goodreads title is there as a whole phrase
 *   of two words or more (three when it is not at the start).
 * - Open Library's is shorter: only if it stops at one of the Goodreads
 *   title's colons and what is left is a tagline — "A Master Chief Story",
 *   "A Novel": a part starting "A" or "An" that describes the book rather than
 *   naming it. "Halo: Edge of Dawn" for "Halo: Edge of Dawn: A Master Chief
 *   Story" passes. "Star Wars : the High Republic" for "Star Wars: The High
 *   Republic: Edge of Balance, Vol. 4" does not — a franchise can run to two
 *   parts, and Open Library filed Vol. 3 and Vol. 4 under that one work in the
 *   trial run. Nor does "Halo", "The Sandman" or anything stopping mid-part.
 */
export function sameTitle(candidate: string, subtitle: string | null, goodreadsTitle: string): boolean {
  const r = fold(goodreadsTitle);
  const parts = goodreadsTitle.split(":");
  // Each way of cutting the title at a colon where the rest is a tagline.
  const taglineCuts = parts
    .map((_, i) => i)
    .filter((i) => i < parts.length - 1 && /^(a|an) /.test(fold(parts.slice(i + 1).join(" "))))
    .map((i) => fold(parts.slice(0, i + 1).join(" ")));

  return [fold(candidate), fold(`${candidate} ${subtitle ?? ""}`)].some((c) => {
    if (!c || !r) return false;
    if (c === r) return true;
    if (c.length > r.length) {
      if (words(r) >= 2 && c.startsWith(`${r} `)) return true;
      return words(r) >= 3 && ` ${c} `.includes(` ${r} `);
    }
    return taglineCuts.includes(c);
  });
}

/**
 * Title search is the last resort before giving up, so it only accepts a
 * result that is plainly the same book: a matching title (sameTitle) and a
 * shared author surname. A wrong match is worse than a local work — the local
 * work is listed for fixing, the wrong match looks right and is not.
 */
function sameBook(result: OlWorkSummary, titles: string[], row: GoodreadsRow): boolean {
  if (!titles.some((mine) => sameTitle(result.title, result.subtitle, mine))) return false;
  if (row.authors.length === 0) return true;
  const theirAuthors = fold(result.authors.join(" ")).split(" ");
  return row.authors.some((name) => {
    const surname = fold(name).split(" ").pop();
    return surname ? theirAuthors.includes(surname) : false;
  });
}

/**
 * What to search Open Library for, best first. Goodreads titles carry things
 * Open Library's do not: a trailing bracket ("(Star Wars: The High Republic)",
 * "(Unabridged)"), an English title in square brackets after a Japanese one
 * ("ドラゴンボール超 24 [Dragon Ball Super 24]"), and long subtitles. Each is
 * tried only if the one before found nothing, so a book that matches first
 * time costs one request.
 *
 * `match` is what a result is compared against: only faithful forms of the
 * title. The part before the last colon is a search term, never a match
 * target — "Star Wars" would otherwise match any Star Wars book by the author.
 */
export function titleQueries(title: string): { search: string[]; match: string[] } {
  const bare = title.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
  const bracketed = title.match(/\[([^\]]+)\]/)?.[1]?.trim();
  const beforeColon = bare.includes(":") ? bare.slice(0, bare.lastIndexOf(":")).trim() : "";
  const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const match = unique([bare || title, bracketed]);
  return { search: unique([...match, words(fold(beforeColon)) >= 2 ? beforeColon : ""]), match };
}

type Plan =
  | { kind: "edition"; editionId: string; workId: string; matchedBy: "previous import" | "isbn" }
  | {
      kind: "openlibrary";
      matchedBy: "isbn" | "title";
      work: { knownId: string } | { fetch: WorkFetch };
      edition: OlEditionSummary | null;
    }
  /** A local work named from Goodreads, keeping Open Library's edition when the ISBN found one. */
  | { kind: "local"; edition: OlEditionSummary | null };

/**
 * The title an imported work is shelved under: the book's own title from
 * Goodreads, less any trailing series bracket — the name the person importing
 * knows it by. Open Library's titles are often a franchise with the book in
 * the subtitle ("Star Wars" / "Jedi Brave in Every Way"), which would put a
 * row of tiles all reading "Star Wars" on the shelf. Open Library's own title
 * is kept in ol_payload.
 */
function displayTitle(_workTitle: string, row: GoodreadsRow): string {
  return titleQueries(row.title).match[0] ?? row.title;
}

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
      const olWorkKey = edition.olWorkKey;
      const [known] = await db
        .select({ id: works.id, title: works.title, subtitle: works.subtitle })
        .from(works)
        .where(eq(works.olWorkKey, olWorkKey));
      // The export already names the authors, so the work's own record is the
      // only other request — no search for names.
      const record = known ? null : await getWorkRecord(olWorkKey);
      const olTitle = known?.title ?? (typeof record?.payload.title === "string" ? record.payload.title.trim() : "");
      const olSubtitle = known?.subtitle ?? (typeof record?.payload.subtitle === "string" ? record.payload.subtitle.trim() : null);

      if (!olTitle || !titleQueries(row.title).match.some((mine) => sameTitle(olTitle, olSubtitle, mine))) {
        // The ISBN names the right edition, but Open Library files it under a
        // work whose title is not this book's — a catch-all ("Halo"), or one
        // work holding several volumes. Look for the real work by title, and
        // failing that give the edition a work of its own. A separate work
        // costs little; a wrong one merges two books and loses one's reads.
        return (await byTitle(row, workFor, edition)) ?? { kind: "local", edition };
      }
      if (known) return { kind: "openlibrary", matchedBy: "isbn", work: { knownId: known.id }, edition };
      if (record) {
        const work = {
          fetch: {
            olWorkKey,
            record,
            summary: {
              olWorkKey,
              title: displayTitle(olTitle || row.title, row),
              subtitle: olSubtitle,
              authors: row.authors,
              firstPublishedYear: row.year,
              coverId: record.coverId,
              editionCount: null,
            },
          },
        };
        return { kind: "openlibrary", matchedBy: "isbn", work, edition };
      }
    }
  }

  // 3. Title and author, strictly.
  // 4. Nothing: a local work, listed afterwards so it can be fixed (§5).
  return (await byTitle(row, workFor, null)) ?? { kind: "local", edition: null };
}

type WorkFor = (
  olWorkKey: string,
  summary: (record: WorkFetch["record"]) => OlWorkSummary,
) => Promise<{ knownId: string } | { fetch: WorkFetch } | null>;

/**
 * Title and author search, strictly, trying the title's cleaner forms in
 * turn. `edition` is an Open Library edition an ISBN already found, carried
 * over so its cover and details are kept on whatever work this finds.
 */
async function byTitle(row: GoodreadsRow, workFor: WorkFor, edition: OlEditionSummary | null): Promise<Plan | null> {
  const titles = titleQueries(row.title);
  for (const query of titles.search) {
    const results = await searchWorks(`${query} ${row.authors[0] ?? ""}`.trim(), 5);
    const match = results.find((result) => sameBook(result, titles.match, row));
    if (match) {
      const work = await workFor(match.olWorkKey, () => ({ ...match, title: displayTitle(match.title, row) }));
      if (work) return { kind: "openlibrary", matchedBy: "title", work, edition };
    }
  }
  return null;
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
      const edition = decided.edition
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
            coverId: decided.kind === "edition" ? null : (decided.edition?.coverId ?? null),
            isbn13: outcome.editionIsbn,
          }
        : null,
    });
  }

  return {
    ...base,
    result: outcome.added ? "added" : "already",
    // A work of its own that still got Open Library's edition by ISBN matched;
    // only a book with neither is "local" — the ones listed for fixing.
    matchedBy: decided.kind === "local" ? (decided.edition ? "isbn" : "local") : decided.matchedBy,
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
