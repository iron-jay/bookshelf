"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { GoodreadsFormatError, parseGoodreads, type GoodreadsRow } from "@/lib/import/goodreads";
import { importGoodreadsRow, type RowOutcome } from "@/lib/import/run";
import { isShelf } from "@/lib/shelves";

import { IMPORT_CHUNK } from "./import-limits";

export type ParseState =
  | { ok: true; rows: GoodreadsRow[]; skipped: { line: number; reason: string }[] }
  | { ok: false; message: string }
  | null;

/**
 * Reads the upload and hands the rows back to the page, which then imports
 * them in small batches (gameshelf's pattern): the page can show progress, and
 * nothing lives in server memory between requests.
 *
 * A missing, empty, oversized or wrong file is a message on the form, never a
 * 500 — gameshelf shipped both of those bugs (§5).
 */
export async function parseGoodreadsUpload(_prev: ParseState, formData: FormData): Promise<ParseState> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose your Goodreads export first — the .csv file." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, message: "That file is larger than 20 MB, which no Goodreads export is." };
  }

  try {
    const { rows, skipped } = parseGoodreads(await file.text());
    if (rows.length === 0) return { ok: false, message: "That export has no books in it." };
    return { ok: true, rows, skipped };
  } catch (error) {
    if (error instanceof GoodreadsFormatError) return { ok: false, message: error.message };
    return { ok: false, message: "That file could not be read as a Goodreads export." };
  }
}

/**
 * Rows come back from the page, so they are checked rather than trusted: the
 * shape the parser produced, and nothing larger than a Goodreads export holds.
 */
function isRow(value: unknown): value is GoodreadsRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  const strOrNull = (v: unknown, max: number) => v === null || str(v, max);
  const date = (v: unknown) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
  return (
    Number.isInteger(row.line) &&
    Number.isInteger(row.bookId) && (row.bookId as number) > 0 &&
    str(row.rawTitle, 1000) && str(row.title, 1000) &&
    Array.isArray(row.authors) && row.authors.length <= 100 && row.authors.every((a) => str(a, 300)) &&
    Array.isArray(row.tags) && row.tags.length <= 100 && row.tags.every((t) => str(t, 100)) &&
    strOrNull(row.isbn13, 13) && strOrNull(row.isbn10, 10) &&
    (row.format === "book" || row.format === "audiobook") &&
    isShelf(row.shelf) &&
    (row.rating === null || (Number.isInteger(row.rating) && (row.rating as number) >= 1 && (row.rating as number) <= 10)) &&
    strOrNull(row.review, 100_000) &&
    date(row.dateRead) && date(row.dateAdded) &&
    Number.isInteger(row.readCount) && (row.readCount as number) >= 0 && (row.readCount as number) <= 100 &&
    (row.year === null || Number.isInteger(row.year)) &&
    (row.series === null ||
      (typeof row.series === "object" &&
        str((row.series as Record<string, unknown>).name, 300) &&
        ((row.series as Record<string, unknown>).position === null ||
          typeof (row.series as Record<string, unknown>).position === "number")))
  );
}

/**
 * One batch, rows in order through Open Library's one-a-second queue — the
 * importer queues, it never fans out (§4). A row that throws for any reason
 * other than Open Library is reported as failed and the batch carries on.
 */
export async function importGoodreadsBatch(rows: unknown): Promise<RowOutcome[]> {
  const user = await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (rows.length > IMPORT_CHUNK) throw new Error(`At most ${IMPORT_CHUNK} rows at a time`);

  const outcomes: RowOutcome[] = [];
  for (const row of rows) {
    if (!isRow(row)) {
      outcomes.push({ line: 0, title: "?", result: "failed", message: "Not a row this import produced." });
      continue;
    }
    try {
      outcomes.push(await importGoodreadsRow(user.id, row));
    } catch (error) {
      console.error(`[import] row ${row.line}`, error);
      outcomes.push({ line: row.line, title: row.rawTitle, result: "failed", message: "Something went wrong on this row; the server log has it." });
    }
  }
  revalidatePath("/");
  return outcomes;
}
