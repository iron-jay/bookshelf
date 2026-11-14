import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { languageOptions } from "@/lib/languages";

import { EDITION_KIND_OPTIONS } from "./edition-facts";
import { readEditionFields, readWorkFields } from "./edit-fields";

/**
 * The edit pages' load and save (§5, "Details are their own page"), shared by
 * their server actions and the phone's `/details` routes so both say and
 * refuse the same things. Values are the form's own strings: what the fields
 * show, and what comes back to be read by `edit-fields.ts`.
 */

export type WorkValues = {
  title: string;
  subtitle: string;
  authors: string;
  authorSort: string;
  year: string;
  summary: string;
};

export type EditionValues = {
  name: string;
  kind: string;
  credit: string;
  language: string;
  publishedOn: string;
  pages: string;
  hours: string;
  minutes: string;
  isbn: string;
  baseEditionId: string;
  url: string;
  notes: string;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

export function workValues(work: typeof works.$inferSelect): WorkValues {
  return {
    title: work.title,
    subtitle: work.subtitle ?? "",
    authors: work.authors.join(", "),
    authorSort: work.authorSort ?? "",
    year: work.firstPublishedYear === null ? "" : String(work.firstPublishedYear),
    summary: work.summary ?? "",
  };
}

export function editionValues(edition: typeof editions.$inferSelect): EditionValues {
  const minutes = edition.durationMinutes;
  return {
    name: edition.name,
    kind: edition.kind,
    credit: edition.credit ?? "",
    language: edition.language ?? "",
    publishedOn: edition.publishedOn ?? "",
    pages: edition.pages === null ? "" : String(edition.pages),
    hours: minutes ? String(Math.floor(minutes / 60)) : "",
    minutes: minutes ? String(minutes % 60) : "",
    isbn: edition.isbn13 ?? "",
    baseEditionId: edition.baseEditionId ?? "",
    url: edition.url ?? "",
    notes: edition.notes ?? "",
  };
}

/** Values arriving as JSON, read by the same rules as the form (`edit-fields.ts`). */
export function formFrom(values: Record<string, unknown>, names: readonly string[]): FormData {
  const form = new FormData();
  for (const name of names) {
    const value = values[name];
    if (typeof value === "string") form.set(name, value);
    else if (typeof value === "number") form.set(name, String(value));
  }
  return form;
}

export const WORK_FIELDS = ["title", "subtitle", "authors", "authorSort", "year", "summary"] as const;
export const EDITION_FIELDS = [
  "name",
  "kind",
  "credit",
  "language",
  "publishedOn",
  "pages",
  "hours",
  "minutes",
  "isbn",
  "baseEditionId",
  "url",
  "notes",
] as const;

/** Works are shared catalogue, like series: any account may correct one. */
export async function saveWorkDetails(workId: string, form: FormData): Promise<SaveResult> {
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId));
  if (!work) return { ok: false, error: "That book is no longer here." };
  const fields = readWorkFields(form);
  if (!fields.ok) return fields;
  await db.update(works).set(fields.set).where(eq(works.id, work.id));
  return { ok: true };
}

/** An edition of yours on your shelf, or null: only someone holding one corrects it. */
async function heldEdition(userId: string, editionId: string) {
  const [edition] = await db
    .select({ id: editions.id, workId: editions.workId })
    .from(editions)
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(eq(editions.id, editionId));
  return edition ?? null;
}

/**
 * The book's details and this edition's, saved together or not at all. The
 * edition must be on your shelf, as before: editions are only corrected by
 * someone holding one.
 */
export async function saveEditionDetails(userId: string, editionId: string, form: FormData): Promise<SaveResult> {
  const edition = await heldEdition(userId, editionId);
  if (!edition) return { ok: false, error: "Add it to your shelf first." };

  const work = readWorkFields(form);
  if (!work.ok) return work;
  const own = await readEditionFields(form, edition);
  if (!own.ok) return own;

  await db.transaction(async (tx) => {
    await tx.update(works).set(work.set).where(eq(works.id, edition.workId));
    await tx.update(editions).set(own.set).where(eq(editions.id, edition.id));
  });
  return { ok: true };
}

/** The work's other editions, for "Translated from or based on". */
export async function otherEditions(workId: string, editionId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: editions.id, name: editions.name })
    .from(editions)
    .where(eq(editions.workId, workId))
    .orderBy(asc(editions.createdAt));
  return rows.filter((row) => row.id !== editionId);
}

/** What the phone's edition edit screen needs, as the page has it; null when not held (the page sends you to the book's). */
export async function editionEditForm(userId: string, editionId: string) {
  if (!(await heldEdition(userId, editionId))) return null;
  const [row] = await db
    .select({ edition: editions, work: works })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, editionId));
  if (!row) return null;
  return {
    workSlug: row.work.slug,
    work: workValues(row.work),
    edition: editionValues(row.edition),
    kinds: EDITION_KIND_OPTIONS,
    languages: languageOptions(row.edition.language),
    otherEditions: await otherEditions(row.work.id, editionId),
  };
}
