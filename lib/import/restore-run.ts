import { randomUUID } from "node:crypto";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { setCollection } from "@/lib/books/collections";
import { lookUpCoversOnAdd, setCover } from "@/lib/books/covers";
import { recordRun, runSeries } from "@/lib/books/runs";
import { setWorkSeries } from "@/lib/books/series";
import { ensureTag, tagEntries } from "@/lib/books/tags";
import type { Tx } from "@/lib/books/works";
import { comicvineEnabled, getIssue } from "@/lib/comicvine";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { editions, entries, reads, series, works } from "@/lib/db/schema";
import { coverUrlForBook } from "@/lib/hardcover";
import { getEdition, getWorkRecord, OpenLibraryError, type OlWorkRecord } from "@/lib/openlibrary";
import { slugify } from "@/lib/slug";

import type { RestoreRow } from "./restore";
import type { RowOutcome } from "./run";

type Found = { workId: string; editionId: string | null };

/**
 * The book already here, if it is: the edition by its Open Library key or
 * Goodreads id, else the work by whichever catalogue id it has, else a local
 * work of the same title and authors — so restoring into a library that has
 * some of it joins what is there rather than doubling it.
 */
async function find(row: RestoreRow): Promise<Found | null> {
  const { edition, work } = row;
  const editionBy = edition.openLibraryKey
    ? eq(editions.olEditionKey, edition.openLibraryKey)
    : edition.goodreadsBookId
      ? eq(editions.goodreadsBookId, edition.goodreadsBookId)
      : null;
  if (editionBy) {
    const [hit] = await db.select({ id: editions.id, workId: editions.workId }).from(editions).where(editionBy).limit(1);
    if (hit) return { workId: hit.workId, editionId: hit.id };
  }

  const workBy = work.openLibraryKey
    ? eq(works.olWorkKey, work.openLibraryKey)
    : work.comicvineIssueId
      ? eq(works.comicvineIssueId, work.comicvineIssueId)
      : work.hardcoverId
        ? eq(works.hardcoverId, work.hardcoverId)
        : and(
            isNull(works.olWorkKey),
            isNull(works.comicvineIssueId),
            eq(sql`lower(${works.title})`, work.title.toLowerCase()),
            eq(works.authors, work.authors),
          );
  const [hit] = await db.select({ id: works.id }).from(works).where(workBy).limit(1);
  if (!hit) return null;

  // An edition of that work by the same name, format and kind — the plain
  // "Book" every add without a chosen edition makes, for one.
  const [same] = edition.openLibraryKey
    ? []
    : await db
        .select({ id: editions.id })
        .from(editions)
        .where(
          and(
            eq(editions.workId, hit.id),
            eq(sql`lower(${editions.name})`, edition.name.toLowerCase()),
            eq(editions.format, edition.format),
            eq(editions.kind, edition.kind),
            isNull(editions.olEditionKey),
          ),
        )
        .limit(1);
  return { workId: hit.id, editionId: same?.id ?? null };
}

/** What the catalogues say for covers and the raw record — asked before the transaction opens. */
type Fetched = {
  record: OlWorkRecord | null;
  editionCoverId: number | null;
  /** A comic's or a Hardcover book's own cover. */
  coverUrl: { url: string; source: "comicvine" | "hardcover" } | null;
};

async function fetchFor(row: RestoreRow, found: Found | null): Promise<Fetched> {
  const { work, edition } = row;
  const needWork = !found;
  const needEdition = !found?.editionId;

  // Open Library's failures fail the row, as the Goodreads import's do:
  // running the file again picks it up. The others only cost a cover.
  const record = needWork && work.openLibraryKey ? await getWorkRecord(work.openLibraryKey) : null;
  const olEdition = needEdition && edition.openLibraryKey ? await getEdition(edition.openLibraryKey) : null;

  let coverUrl: Fetched["coverUrl"] = null;
  if (needWork && work.comicvineIssueId && comicvineEnabled()) {
    const issue = await getIssue(work.comicvineIssueId).catch(() => null);
    if (issue?.coverUrl) coverUrl = { url: issue.coverUrl, source: "comicvine" };
  } else if (needWork && work.hardcoverId) {
    const url = await coverUrlForBook(work.hardcoverId).catch(() => null);
    if (url) coverUrl = { url, source: "hardcover" };
  }
  return { record, editionCoverId: olEdition?.coverId ?? null, coverUrl };
}

/** A work from the file's own details: what you had, titles and summaries as you left them. */
async function insertWork(tx: Tx, row: RestoreRow, record: OlWorkRecord | null, userId: string): Promise<string> {
  const { work } = row;
  const id = randomUUID();
  const base = slugify(work.title);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
  await tx.insert(works).values({
    id,
    olWorkKey: work.openLibraryKey,
    slug: clash ? `${base}-${work.openLibraryKey?.toLowerCase() ?? id.slice(0, 8)}` : base,
    title: work.title,
    subtitle: work.subtitle,
    authors: work.authors,
    authorSort: authorSortFor(work.authors[0]),
    olAuthorKeys: record?.authorKeys ?? null,
    summary: work.summary,
    firstPublishedYear: work.firstPublishedYear,
    olPayload: record?.payload ?? null,
    olSyncedAt: record ? new Date() : null,
    hardcoverId: work.hardcoverId,
    comicvineIssueId: work.comicvineIssueId,
    source: work.source as "openlibrary" | "local" | "comicvine",
    createdBy: userId,
  });
  return id;
}

async function insertEdition(tx: Tx, row: RestoreRow, workId: string, userId: string): Promise<string> {
  const { edition } = row;
  const [created] = await tx
    .insert(editions)
    .values({
      workId,
      name: edition.name,
      kind: edition.kind,
      format: edition.format,
      credit: edition.credit,
      language: edition.language,
      publisher: edition.publisher,
      publishedOn: edition.publishedOn,
      pages: edition.pages,
      durationMinutes: edition.durationMinutes,
      isbn13: edition.isbn13,
      isbn10: edition.isbn10,
      url: edition.url,
      notes: edition.notes,
      olEditionKey: edition.openLibraryKey,
      goodreadsBookId: edition.goodreadsBookId,
      source: edition.openLibraryKey ? "openlibrary" : "local",
      createdBy: userId,
    })
    .returning({ id: editions.id });

  // The edition it translates or narrates, by name within the book. The file
  // puts these last, so the base is here by now if it was exported at all.
  if (edition.baseEdition) {
    const [base] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(and(eq(editions.workId, workId), eq(editions.name, edition.baseEdition), ne(editions.id, created.id)))
      .limit(1);
    if (base) await tx.update(editions).set({ baseEditionId: base.id }).where(eq(editions.id, created.id));
  }
  return created.id;
}

/** Series and collection, on a book that has none yet: one set here by hand stays. */
async function placeInSeries(tx: Tx, row: RestoreRow, workId: string, userId: string): Promise<void> {
  const { work } = row;
  const [current] = await tx
    .select({ seriesId: works.seriesId, collectionId: works.collectionId })
    .from(works)
    .where(eq(works.id, workId));
  if (!current) return;

  let seriesId = current.seriesId;
  if (!seriesId && work.series) {
    if (work.seriesRun) {
      seriesId = await runSeries(
        tx,
        work.series,
        { comicvineVolumeId: work.seriesRun.comicvineVolumeId, issueCount: work.seriesRun.issueCount ?? 0, startYear: null },
        userId,
      );
      await tx.update(works).set({ seriesId, seriesPosition: work.seriesPosition }).where(eq(works.id, workId));
    } else {
      await setWorkSeries(tx, workId, work.series, work.seriesPosition, userId);
      seriesId = (await tx.select({ id: works.seriesId }).from(works).where(eq(works.id, workId)))[0]?.id ?? null;
    }
  } else if (seriesId && work.seriesRun?.issueCount) {
    await recordRun(tx, workId, { ...work.seriesRun, issueCount: work.seriesRun.issueCount, startYear: null });
  }

  if (!work.collection) return;
  if (seriesId) {
    const [s] = await tx.select({ collectionId: series.collectionId }).from(series).where(eq(series.id, seriesId));
    if (s && !s.collectionId) await setCollection(tx, { kind: "series", id: seriesId }, work.collection, userId);
  } else if (!current.collectionId) {
    await setCollection(tx, { kind: "work", id: workId }, work.collection, userId);
  }
}

/** The shelf row, its reads and tags — or nothing, if this edition is already on the shelf. */
async function addEntry(tx: Tx, userId: string, editionId: string, row: RestoreRow): Promise<boolean> {
  const [entry] = await tx
    .insert(entries)
    .values({
      userId,
      editionId,
      status: row.shelf,
      rating: row.rating,
      review: row.review,
      addedAt: new Date(row.addedAt),
    })
    .onConflictDoNothing()
    .returning({ id: entries.id });
  if (!entry) return false;

  if (row.reads.length > 0) {
    await tx.insert(reads).values(row.reads.map((r) => ({ entryId: entry.id, ...r })));
  }
  for (const name of row.tags) {
    await tagEntries(tx, await ensureTag(tx, userId, name), [entry.id]);
  }
  return true;
}

/**
 * Restores one entry of a bookshelf export. Idempotent: a book already here
 * is joined rather than doubled, and an entry already on the shelf is left
 * exactly as it is — so running the same file twice changes nothing, and a
 * run that stopped carries on where it left off.
 *
 * Details come from the file, not the catalogues: titles, summaries and
 * series as you left them. The catalogues are asked only for what the file
 * does not carry — Open Library's raw record, and covers, which are looked up
 * again in the order an add uses (a cover you uploaded is not in the file).
 */
export async function restoreRow(userId: string, row: RestoreRow): Promise<RowOutcome> {
  const base = { line: row.line, title: row.work.title };

  const found = await find(row);
  let fetched: Fetched;
  try {
    fetched = await fetchFor(row, found);
  } catch (error) {
    if (error instanceof OpenLibraryError) return { ...base, result: "failed", message: error.message };
    throw error;
  }

  const outcome = await db.transaction(async (tx) => {
    const workId = found?.workId ?? (await insertWork(tx, row, fetched.record, userId));
    const editionId = found?.editionId ?? (await insertEdition(tx, row, workId, userId));
    await placeInSeries(tx, row, workId, userId);
    const added = await addEntry(tx, userId, editionId, row);
    return { workId, editionId, added };
  });

  const workCreated = !found;
  const editionCreated = !found?.editionId;
  if (workCreated || editionCreated) {
    // A cover is a nicety here: the book is restored whether or not one comes.
    try {
      let workCovered = false;
      if (workCreated && fetched.coverUrl) {
        const stored = await downloadCover(fetched.coverUrl.url);
        if (stored.ok) {
          await setCover({ kind: "work", id: outcome.workId }, stored.path, fetched.coverUrl.source, false);
          workCovered = true;
        }
      }
      await lookUpCoversOnAdd({
        work:
          workCreated && !workCovered
            ? {
                id: outcome.workId,
                title: row.work.title,
                firstAuthor: row.work.authors[0] ?? null,
                coverId: fetched.record?.coverId ?? null,
              }
            : null,
        workId: outcome.workId,
        edition: editionCreated
          ? { id: outcome.editionId, coverId: fetched.editionCoverId, isbn13: row.edition.isbn13 }
          : null,
      });
    } catch (error) {
      console.error(`[restore] cover for entry ${row.line}`, error);
    }
  }

  return { ...base, result: outcome.added ? "added" : "already" };
}
