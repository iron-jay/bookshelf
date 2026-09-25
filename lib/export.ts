import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { editions, entries, entryTags, reads, series, tags, works } from "@/lib/db/schema";

export type ExportRead = { startedOn: string | null; finishedOn: string | null; note: string | null };

export type ExportEntry = {
  shelf: string;
  rating: number | null;
  review: string | null;
  addedAt: string;
  tags: string[];
  reads: ExportRead[];
  edition: {
    name: string;
    kind: string;
    format: string;
    credit: string | null;
    language: string | null;
    publisher: string | null;
    publishedOn: string | null;
    pages: number | null;
    durationMinutes: number | null;
    isbn13: string | null;
    isbn10: string | null;
    url: string | null;
    notes: string | null;
    baseEdition: string | null;
    source: string;
    openLibraryKey: string | null;
    goodreadsBookId: number | null;
  };
  work: {
    title: string;
    subtitle: string | null;
    authors: string[];
    firstPublishedYear: number | null;
    summary: string | null;
    series: string | null;
    seriesPosition: number | null;
    source: string;
    openLibraryKey: string | null;
  };
};

export type ExportDocument = {
  exportedAt: string;
  username: string;
  note: string;
  entryCount: number;
  entries: ExportEntry[];
};

/**
 * Everything on one account's shelf. Open Library's raw payloads are left out
 * on purpose: they are upstream data that can be fetched again, not yours.
 */
export async function buildExport(userId: string, username: string): Promise<ExportDocument> {
  const base = alias(editions, "base");
  const rows = await db
    .select({ entry: entries, edition: editions, work: works, seriesName: series.name, baseName: base.name })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .innerJoin(works, eq(works.id, editions.workId))
    .leftJoin(series, eq(series.id, works.seriesId))
    .leftJoin(base, eq(base.id, editions.baseEditionId))
    .where(eq(entries.userId, userId))
    .orderBy(asc(entries.addedAt));

  const ids = rows.map((row) => row.entry.id);
  const readRows = ids.length
    ? await db.select().from(reads).where(inArray(reads.entryId, ids)).orderBy(asc(reads.createdAt))
    : [];
  const tagRows = ids.length
    ? await db
        .select({ entryId: entryTags.entryId, name: tags.name })
        .from(entryTags)
        .innerJoin(tags, eq(tags.id, entryTags.tagId))
        .where(inArray(entryTags.entryId, ids))
        .orderBy(asc(tags.name))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    username,
    note: "bookshelf export. Ratings are out of ten. Reads are one pass each; rereads are separate reads.",
    entryCount: rows.length,
    entries: rows.map(({ entry, edition, work, seriesName, baseName }) => ({
      shelf: entry.status,
      rating: entry.rating,
      review: entry.review,
      addedAt: entry.addedAt.toISOString(),
      tags: tagRows.filter((t) => t.entryId === entry.id).map((t) => t.name),
      reads: readRows
        .filter((r) => r.entryId === entry.id)
        .map((r) => ({ startedOn: r.startedOn, finishedOn: r.finishedOn, note: r.note })),
      edition: {
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
        baseEdition: baseName,
        source: edition.source,
        openLibraryKey: edition.olEditionKey,
        goodreadsBookId: edition.goodreadsBookId,
      },
      work: {
        title: work.title,
        subtitle: work.subtitle,
        authors: work.authors,
        firstPublishedYear: work.firstPublishedYear,
        summary: work.summary,
        series: seriesName,
        seriesPosition: work.seriesPosition,
        source: work.source,
        openLibraryKey: work.olWorkKey,
      },
    })),
  };
}

/** Quoted when it has to be, per RFC 4180, so reviews with commas and newlines survive. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS = [
  "Title", "Authors", "Series", "Series number", "Edition", "Kind", "Format", "Credit", "Language",
  "ISBN13", "ISBN10", "Shelf", "Rating (of 10)", "Tags", "Date added", "Last finished",
  "Times finished", "Reads", "Review", "Open Library work", "Goodreads Book Id",
];

/**
 * One row per shelf entry, the way a Goodreads export is one row per book.
 * Reads are summarised ("2026-01-10 → 2026-01-20; ? → 2026-03-01"); the JSON
 * keeps every field of every read.
 */
export function toCsv(doc: ExportDocument): string {
  const lines = [COLUMNS.join(",")];
  for (const e of doc.entries) {
    const finishes = e.reads.map((r) => r.finishedOn).filter((d): d is string => Boolean(d)).sort();
    lines.push(
      [
        e.work.title,
        e.work.authors.join(", "),
        e.work.series,
        e.work.seriesPosition,
        e.edition.name,
        e.edition.kind,
        e.edition.format,
        e.edition.credit,
        e.edition.language,
        e.edition.isbn13,
        e.edition.isbn10,
        e.shelf,
        e.rating,
        e.tags.join(", "),
        e.addedAt.slice(0, 10),
        finishes.at(-1) ?? null,
        e.reads.filter((r) => r.finishedOn || !r.startedOn).length,
        // A read with no dates at all is an undated past read (Goodreads' Read
        // Count), not one in progress — so it says so rather than "? → …".
        e.reads
          .map((r) => (!r.startedOn && !r.finishedOn ? "undated" : `${r.startedOn ?? "?"} → ${r.finishedOn ?? "…"}`))
          .join("; "),
        e.review,
        e.work.openLibraryKey,
        e.edition.goodreadsBookId,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
