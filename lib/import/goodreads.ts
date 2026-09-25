/**
 * Goodreads' "Export Library" CSV, read into rows bookshelf can import (brief
 * §5). Pure: no database, no network, so every rule here is unit-testable.
 */
import { parseIsbn } from "@/lib/isbn";
import type { Shelf } from "@/lib/shelves";

import { parseCsv } from "./csv";

export type GoodreadsRow = {
  /**
   * Row in the file, header as 1, for telling someone which went wrong. Rows,
   * not lines: a review with line breaks spans several lines but one row.
   */
  line: number;
  bookId: number;
  /** As Goodreads wrote it, series suffix and all. */
  rawTitle: string;
  title: string;
  series: { name: string; position: number | null } | null;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  format: "book" | "audiobook";
  shelf: Shelf;
  tags: string[];
  /** Out of ten; null for unrated. */
  rating: number | null;
  review: string | null;
  dateRead: string | null;
  dateAdded: string | null;
  readCount: number;
  year: number | null;
};

export type GoodreadsParse = { rows: GoodreadsRow[]; skipped: { line: number; reason: string }[] };

export class GoodreadsFormatError extends Error {}

const REQUIRED = ["Book Id", "Title", "Author", "Exclusive Shelf"];

const EXCLUSIVE: Readonly<Record<string, Shelf>> = {
  "to-read": "tbr",
  "currently-reading": "reading",
  read: "finished",
};

/**
 * Goodreads has three built-in exclusive shelves, and people add their own for
 * abandoned books under a handful of names. Those are unambiguous enough to
 * map; any other custom exclusive shelf becomes To read plus a tag of its name,
 * so nothing is lost and nothing is guessed.
 */
const DNF_NAMES = new Set(["dnf", "did-not-finish", "abandoned", "gave-up", "dropped"]);

/**
 * People who track audiobooks on Goodreads often make an exclusive shelf for
 * them, since Goodreads has no way to say "read, as audio". A book there is
 * finished, and it was an audiobook whatever edition Goodreads had selected —
 * in the export that prompted this, 15 of 33 said Hardcover.
 */
const LISTENED_NAMES = new Set(["listened-to", "listened", "audiobooks-listened", "listened-audiobooks"]);

/** Goodreads wraps ISBNs as ="0552134627" so spreadsheets keep the zeros. */
function isbnCell(value: string): string {
  return value.replace(/^="?/, "").replace(/"$/, "").trim();
}

/** "2026/03/01" or "2026-03-01", a real day, or null. */
export function goodreadsDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Goodreads exports reviews as HTML: <br/> for line breaks, <i>, <b>, <a> and
 * entities. Line breaks become newlines, every other tag goes, entities are
 * decoded (brief §5).
 */
export function reviewText(html: string): string | null {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return text || null;
}

/**
 * "Guards! Guards! (Discworld, #8)" → the title and the series. Goodreads
 * puts the series in the title of every book in one, which is the best series
 * data an import will ever get. Omnibus ranges ("#1-3") keep the series but no
 * position; a title with brackets that are not a series is left alone.
 */
export function splitSeries(raw: string): { title: string; series: GoodreadsRow["series"] } {
  const match = raw.match(/^(.*\S)\s*\(([^()]+?),?\s+#([^()]*)\)\s*$/);
  if (!match) return { title: raw.trim(), series: null };
  const position = /^\d{1,4}(\.\d{1,2})?$/.test(match[3].trim()) ? Number(match[3].trim()) : null;
  return { title: match[1].trim(), series: { name: match[2].trim(), position } };
}

function authorsOf(author: string, additional: string): string[] {
  const names = [author, ...additional.split(",")].map((name) => name.trim().replace(/\s+/g, " "));
  return [...new Set(names.filter(Boolean))];
}

/** The four built-in shelf names are never tags; they are the shelf itself. */
const BUILT_IN = new Set(["to-read", "currently-reading", "read"]);

export function parseGoodreads(text: string): GoodreadsParse {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (error) {
    throw new GoodreadsFormatError(error instanceof Error ? error.message : "That file is not CSV.");
  }

  const header = table[0]?.map((cell) => cell.trim()) ?? [];
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    throw new GoodreadsFormatError(
      `That does not look like a Goodreads export: it has no ${missing.map((m) => `“${m}”`).join(", ")} column. ` +
        "Export it from Goodreads under My Books → Import and export.",
    );
  }
  const col = (row: string[], name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };

  const rows: GoodreadsRow[] = [];
  const skipped: GoodreadsParse["skipped"] = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => cell.trim() === "")) return;

    const bookId = Number(col(cells, "Book Id"));
    const rawTitle = col(cells, "Title");
    if (!Number.isInteger(bookId) || bookId <= 0 || !rawTitle) {
      skipped.push({ line, reason: "no Book Id or title" });
      return;
    }

    const isbn = parseIsbn(isbnCell(col(cells, "ISBN13")) || isbnCell(col(cells, "ISBN")));
    const exclusive = col(cells, "Exclusive Shelf").toLowerCase();
    const listened = LISTENED_NAMES.has(exclusive);
    const shelf: Shelf =
      EXCLUSIVE[exclusive] ?? (DNF_NAMES.has(exclusive) ? "dnf" : listened ? "finished" : "tbr");

    const tags = col(cells, "Bookshelves")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && !BUILT_IN.has(name.toLowerCase()) && name.toLowerCase() !== exclusive);
    // A custom exclusive shelf that is not a known name survives as a tag, so
    // nothing is lost and nothing is guessed.
    if (!EXCLUSIVE[exclusive] && !DNF_NAMES.has(exclusive) && !listened && exclusive) tags.unshift(exclusive);

    const stars = Number(col(cells, "My Rating"));
    const readCount = Number(col(cells, "Read Count"));
    const { title, series } = splitSeries(rawTitle);
    const year =
      Number(col(cells, "Original Publication Year")) || Number(col(cells, "Year Published")) || null;

    rows.push({
      line,
      bookId,
      rawTitle,
      title,
      series,
      authors: authorsOf(col(cells, "Author"), col(cells, "Additional Authors")),
      isbn13: isbn.kind === "isbn" ? isbn.isbn.isbn13 : null,
      isbn10: isbn.kind === "isbn" ? isbn.isbn.isbn10 : null,
      format: listened || /audio/i.test(col(cells, "Binding")) ? "audiobook" : "book",
      shelf,
      tags: [...new Set(tags)],
      // Zero stars means unrated, not a zero (§5).
      rating: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars * 2 : null,
      review: reviewText(col(cells, "My Review")),
      dateRead: goodreadsDate(col(cells, "Date Read")),
      dateAdded: goodreadsDate(col(cells, "Date Added")),
      readCount: Number.isInteger(readCount) && readCount > 0 ? Math.min(readCount, 100) : 0,
      year: year && year > 0 && year < 3000 ? year : null,
    });
  });

  return { rows, skipped };
}
