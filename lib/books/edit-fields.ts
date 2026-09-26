import { and, eq } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { parseIsbn } from "@/lib/isbn";
import { isUuid } from "@/lib/uuid";

/**
 * Reading the edit page's fields (§5: works and editions are correctable —
 * Open Library's data is uneven and the person with the book knows better).
 * Shared by /work/[slug]/edit and /edition/[id]/edit, which save the work's
 * fields alone or the work's and the edition's together.
 */

type Parsed<T> = { ok: true; set: T } | { ok: false; error: string };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function dateFrom(value: string): string | null | "invalid" {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "invalid" : value;
}

/**
 * The work's own details. The slug is not among them, so links and bookmarks
 * to the work keep working after a title is corrected.
 */
export function readWorkFields(formData: FormData): Parsed<Partial<typeof works.$inferInsert>> {
  const fail = (error: string) => ({ ok: false as const, error });

  const title = text(formData, "title");
  if (!title) return fail("A book needs a title.");
  const authors = text(formData, "authors")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);

  const yearText = text(formData, "year");
  const year = yearText ? Number(yearText) : null;
  if (year !== null && (!Number.isInteger(year) || year < -3000 || year > 2100)) {
    return fail("The year should be a whole number, like 1989.");
  }

  // Not trimmed inside: paragraph breaks in a summary are deliberate.
  const rawSummary = formData.get("summary");
  const summary = typeof rawSummary === "string" && rawSummary.trim() ? rawSummary.trim() : null;
  if (summary && summary.length > 20_000) return fail("That summary is too long to keep.");

  return {
    ok: true,
    set: {
      title: title.slice(0, 500),
      subtitle: text(formData, "subtitle").slice(0, 500) || null,
      authors,
      // Blank means "work it out from the first author" — the same rule as on
      // add. Typed means someone knows better, as with pen names and
      // family-name-first names.
      authorSort: text(formData, "authorSort").slice(0, 200) || authorSortFor(authors[0]),
      firstPublishedYear: year,
      summary,
    },
  };
}

export const EDITION_KINDS = [
  "original",
  "translation",
  "fan_translation",
  "revised",
  "abridged",
  "annotated",
  "other",
] as const;

/**
 * Everything about an edition except its format, which has its own toggle on
 * the edition page. Blank fields become empty rather than kept, so a wrong
 * value can be cleared.
 */
export async function readEditionFields(
  formData: FormData,
  edition: { id: string; workId: string },
): Promise<Parsed<Partial<typeof editions.$inferInsert>>> {
  const fail = (error: string) => ({ ok: false as const, error });

  const name = text(formData, "name");
  if (!name) return fail("An edition needs a name, like “Paperback, Corgi 1990”.");
  const kind = text(formData, "kind");
  if (!(EDITION_KINDS as readonly string[]).includes(kind)) return fail("Choose what kind of edition this is.");

  const languageRaw = text(formData, "language");
  let language: string | null = null;
  if (languageRaw) {
    try {
      language = Intl.getCanonicalLocales(languageRaw)[0] ?? null;
    } catch {
      return fail("That language is not one this server knows.");
    }
  }

  const publishedOn = dateFrom(text(formData, "publishedOn"));
  if (publishedOn === "invalid") return fail("The publication date should be a real day.");

  const whole = (field: string, max: number): number | null | "invalid" => {
    const value = text(formData, field);
    if (!value) return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= max ? n : "invalid";
  };
  const pages = whole("pages", 100_000);
  if (pages === "invalid") return fail("Pages should be a whole number.");
  const hours = whole("hours", 999);
  const minutesText = text(formData, "minutes");
  const minutes = minutesText ? Number(minutesText) : 0;
  if (hours === "invalid" || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return fail("Length should be whole hours and minutes, minutes under 60.");
  }
  const durationMinutes = (hours ?? 0) * 60 + minutes || null;

  const isbnText = text(formData, "isbn");
  const isbn = isbnText ? parseIsbn(isbnText) : null;
  if (isbn && isbn.kind !== "isbn") {
    return fail(isbn.kind === "bad-checksum" ? "That ISBN's check digit is wrong — probably a typo." : "That is not an ISBN.");
  }

  const urlText = text(formData, "url");
  let url: string | null = null;
  if (urlText) {
    try {
      const parsed = new URL(urlText);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      url = parsed.toString();
    } catch {
      return fail("The link should start with http:// or https://.");
    }
  }

  // The base must be another edition of the same work; the schema forbids an
  // edition being its own base.
  const baseId = text(formData, "baseEditionId");
  if (baseId) {
    if (!isUuid(baseId) || baseId === edition.id) return fail("Choose another edition of this book as the base.");
    const [base] = await db
      .select({ id: editions.id })
      .from(editions)
      .where(and(eq(editions.id, baseId), eq(editions.workId, edition.workId)));
    if (!base) return fail("The base edition belongs to a different book.");
  }

  const rawNotes = formData.get("notes");
  const notes = typeof rawNotes === "string" && rawNotes.trim() ? rawNotes.trim().slice(0, 5000) : null;

  return {
    ok: true,
    set: {
      name: name.slice(0, 200),
      kind: kind as (typeof EDITION_KINDS)[number],
      credit: text(formData, "credit").slice(0, 200) || null,
      language,
      publisher: text(formData, "publisher").slice(0, 200) || null,
      publishedOn,
      pages,
      durationMinutes,
      isbn13: isbn?.kind === "isbn" ? isbn.isbn.isbn13 : null,
      isbn10: isbn?.kind === "isbn" ? isbn.isbn.isbn10 : null,
      url,
      notes,
      baseEditionId: baseId || null,
    },
  };
}
