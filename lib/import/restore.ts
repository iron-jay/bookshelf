/**
 * bookshelf's own JSON export, read back in: to restore a library, or to move
 * one to another server. The CSV is a summary for spreadsheets and is not read.
 *
 * Pure: no database, no network. The rows go to the page and come back in
 * batches, so they are checked on the way in and again on the way back.
 */
import { SHELVES } from "@/lib/shelves";
import type { Shelf } from "@/lib/shelves";
import type { ExportEntry } from "@/lib/export";

export type RestoreRow = ExportEntry & {
  /** Position in the file, from 1, for saying which went wrong. */
  line: number;
  shelf: Shelf;
  edition: ExportEntry["edition"] & { format: "book" | "audiobook"; kind: EditionKind };
};

export type RestoreParse = { rows: RestoreRow[]; skipped: { line: number; reason: string }[] };

export class RestoreFormatError extends Error {}

const EDITION_KINDS = ["original", "revised", "abridged", "annotated", "translation", "other"] as const;
type EditionKind = (typeof EDITION_KINDS)[number];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
/** Absent (an export from before the field existed) reads as null. */
const opt = (v: unknown, max: number): string | null | false =>
  v === null || v === undefined ? null : typeof v === "string" && v.length <= max ? v || null : false;
const optInt = (v: unknown, min: number, max: number): number | null | false =>
  v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : false;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const optDay = (v: unknown): string | null | false =>
  v === null || v === undefined ? null : typeof v === "string" && DAY.test(v) ? v : false;

/** One entry as the export wrote it, or the reason it cannot be used. */
export function toRestoreRow(value: unknown, line: number): RestoreRow | string {
  if (!isObj(value) || !isObj(value.edition) || !isObj(value.work)) return "not an entry";
  const { edition, work } = value;

  if (!str(work.title, 500)) return "no title";
  if (!Array.isArray(work.authors) || work.authors.length > 50 || !work.authors.every((a) => str(a, 300))) {
    return "authors unreadable";
  }
  if (!SHELVES.includes(value.shelf as Shelf)) return `unknown shelf "${String(value.shelf)}"`;
  if (edition.format !== "book" && edition.format !== "audiobook") return "format unreadable";
  if (!EDITION_KINDS.includes(edition.kind as EditionKind)) return "edition kind unreadable";
  if (!str(edition.name, 500)) return "edition has no name";

  const rating = optInt(value.rating, 1, 10);
  const addedAt = typeof value.addedAt === "string" && !Number.isNaN(Date.parse(value.addedAt)) ? value.addedAt : null;
  if (rating === false) return "rating unreadable";

  const tags = Array.isArray(value.tags) ? value.tags : [];
  if (tags.length > 100 || !tags.every((t) => str(t, 100))) return "tags unreadable";

  const rawReads = Array.isArray(value.reads) ? value.reads : [];
  if (rawReads.length > 200) return "too many reads";
  const reads: RestoreRow["reads"] = [];
  for (const r of rawReads) {
    if (!isObj(r)) return "a read is unreadable";
    const startedOn = optDay(r.startedOn);
    const finishedOn = optDay(r.finishedOn);
    const note = opt(r.note, 5000);
    if (startedOn === false || finishedOn === false || note === false) return "a read is unreadable";
    // The schema's own rule: a read cannot finish before it starts.
    if (startedOn && finishedOn && finishedOn < startedOn) return "a read finishes before it starts";
    reads.push({ startedOn, finishedOn, note });
  }

  const run = isObj(work.seriesRun) ? work.seriesRun : null;
  const seriesRun = run
    ? { comicvineVolumeId: optInt(run.comicvineVolumeId, 1, 2 ** 31 - 1), issueCount: optInt(run.issueCount, 0, 100_000) }
    : null;

  const fields = {
    review: opt(value.review, 100_000),
    eCredit: opt(edition.credit, 500),
    eLanguage: opt(edition.language, 20),
    ePublisher: opt(edition.publisher, 500),
    ePublishedOn: optDay(edition.publishedOn),
    ePages: optInt(edition.pages, 1, 100_000),
    eDuration: optInt(edition.durationMinutes, 1, 100_000),
    eIsbn13: opt(edition.isbn13, 13),
    eIsbn10: opt(edition.isbn10, 10),
    eUrl: opt(edition.url, 2000),
    eNotes: opt(edition.notes, 20_000),
    eBase: opt(edition.baseEdition, 500),
    eOl: opt(edition.openLibraryKey, 30),
    eGoodreads: optInt(edition.goodreadsBookId, 1, Number.MAX_SAFE_INTEGER),
    wSubtitle: opt(work.subtitle, 500),
    wYear: optInt(work.firstPublishedYear, -3000, 3000),
    wSummary: opt(work.summary, 50_000),
    wCollection: opt(work.collection, 200),
    wSeries: opt(work.series, 300),
    wOl: opt(work.openLibraryKey, 30),
    wHardcover: optInt(work.hardcoverId, 1, 2 ** 31 - 1),
    wComic: optInt(work.comicvineIssueId, 1, 2 ** 31 - 1),
  };
  const bad = Object.entries(fields).find(([, v]) => v === false);
  if (bad) return `${bad[0].replace(/^[ew]/, "").toLowerCase()} unreadable`;
  if (seriesRun && (seriesRun.comicvineVolumeId === false || seriesRun.issueCount === false)) return "series run unreadable";

  const position = work.seriesPosition;
  if (position !== null && position !== undefined && (typeof position !== "number" || position < 0 || position >= 10_000)) {
    return "series number unreadable";
  }

  const f = fields as { [K in keyof typeof fields]: Exclude<(typeof fields)[K], false> };
  return {
    line,
    shelf: value.shelf as Shelf,
    rating,
    review: f.review,
    addedAt: addedAt ?? new Date().toISOString(),
    tags: tags as string[],
    reads,
    edition: {
      name: (edition.name as string).trim(),
      kind: edition.kind as EditionKind,
      format: edition.format,
      credit: f.eCredit,
      language: f.eLanguage,
      publisher: f.ePublisher,
      publishedOn: f.ePublishedOn,
      pages: f.ePages,
      durationMinutes: f.eDuration,
      isbn13: f.eIsbn13,
      isbn10: f.eIsbn10,
      url: f.eUrl,
      notes: f.eNotes,
      baseEdition: f.eBase,
      source: f.eOl ? "openlibrary" : "local",
      openLibraryKey: f.eOl,
      goodreadsBookId: f.eGoodreads,
    },
    work: {
      title: work.title.trim(),
      subtitle: f.wSubtitle,
      authors: (work.authors as string[]).map((a) => a.trim()),
      firstPublishedYear: f.wYear,
      summary: f.wSummary,
      collection: f.wCollection,
      series: f.wSeries,
      seriesPosition: f.wSeries && typeof position === "number" ? position : null,
      seriesRun:
        f.wSeries && seriesRun?.comicvineVolumeId
          ? { comicvineVolumeId: seriesRun.comicvineVolumeId, issueCount: seriesRun.issueCount || null }
          : null,
      source: f.wOl ? "openlibrary" : f.wComic ? "comicvine" : "local",
      openLibraryKey: f.wOl,
      hardcoverId: f.wHardcover,
      comicvineIssueId: f.wComic,
    },
  };
}

/**
 * The whole file. Another app's export, or a Goodreads CSV, is a message
 * rather than a pile of skipped rows.
 */
export function parseRestore(text: string): RestoreParse {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new RestoreFormatError("That file is not JSON. Choose the .json download from Settings → Export.");
  }
  if (!isObj(doc) || !Array.isArray(doc.entries)) {
    throw new RestoreFormatError("That file is not a bookshelf export.");
  }
  if (typeof doc.note === "string" && !doc.note.startsWith("bookshelf export")) {
    throw new RestoreFormatError("That is not a bookshelf export. A gameshelf export goes into gameshelf.");
  }

  const rows: RestoreRow[] = [];
  const skipped: RestoreParse["skipped"] = [];
  doc.entries.forEach((value, i) => {
    const row = toRestoreRow(value, i + 1);
    if (typeof row === "string") skipped.push({ line: i + 1, reason: row });
    else rows.push(row);
  });

  // Editions made from another (a translation, an audiobook of a text) go
  // after the rest, so the edition they name is here when they arrive.
  rows.sort((a, b) => Number(Boolean(a.edition.baseEdition)) - Number(Boolean(b.edition.baseEdition)));
  return { rows, skipped };
}
