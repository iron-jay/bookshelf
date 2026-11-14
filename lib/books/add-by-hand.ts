import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editionKind, editions, works } from "@/lib/db/schema";
import { languageOptions } from "@/lib/languages";
import { OpenLibraryError } from "@/lib/openlibrary";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

import { AddBookError } from "./add";
import { addEdition, type AddEditionResult, type WorkTarget } from "./add-edition";
import { readBookDraft } from "./draft";

/**
 * The one form for editions typed in by hand (§5): Door A's "Create it
 * manually" and Door B's "Add edition" on a work page. Read from the form's
 * own fields, so the web's action and the phone's `POST /editions` (its JSON
 * read into a FormData) say and refuse the same things.
 */

export type ByHandResult = { ok: true; added: AddEditionResult; format: "book" | "audiobook" } | { ok: false; error: string };

/** The form's field names, for reading the phone's JSON as the form. */
export const BY_HAND_FIELDS = [
  "workId",
  "title",
  "subtitle",
  "authors",
  "authorSort",
  "year",
  "summary",
  "series",
  "position",
  "kind",
  "name",
  "format",
  "credit",
  "hours",
  "minutes",
  "language",
  "baseEditionId",
  "url",
  "notes",
  "shelf",
] as const;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Whole hours and minutes, both optional; null when neither adds up to anything. */
export function durationFrom(formData: FormData): number | null | "invalid" {
  const hours = text(formData, "hours");
  const minutes = text(formData, "minutes");
  if (!hours && !minutes) return null;
  const h = hours ? Number(hours) : 0;
  const m = minutes ? Number(minutes) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return "invalid";
  return h * 60 + m || null;
}

/** Comma-separated, as people type a list of names. */
function authorsFrom(value: string): string[] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function workTargetFrom(formData: FormData): WorkTarget | string {
  const workId = text(formData, "workId");
  const title = text(formData, "title");
  if (workId) return isUuid(workId) ? { kind: "existing", workId } : "That link is broken.";
  if (!title) return "Give the book a title, or pick it from the search.";
  const draft = readBookDraft(formData);
  if (draft && !draft.ok) return draft.error;
  return { kind: "new", title: title.slice(0, 500), authors: authorsFrom(text(formData, "authors")), draft: draft?.draft };
}

function isEditionKind(value: string): value is (typeof editionKind.enumValues)[number] {
  return (editionKind.enumValues as readonly string[]).includes(value);
}

/** A language code Intl recognises, canonicalised ("EN" → "en"), or blank. */
function languageFrom(value: string): string | null | "invalid" {
  if (!value) return null;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return "invalid";
  }
}

function urlFrom(value: string): string | null | "invalid" {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export async function addByHand(userId: string, formData: FormData): Promise<ByHandResult> {
  const work = workTargetFrom(formData);
  if (typeof work === "string") return { ok: false, error: work };

  const kind = text(formData, "kind");
  const format = text(formData, "format");
  if (!isEditionKind(kind)) return { ok: false, error: "Choose what kind of edition this is." };
  if (format !== "book" && format !== "audiobook") return { ok: false, error: "Choose Book or Audiobook." };

  const duration = durationFrom(formData);
  if (duration === "invalid") return { ok: false, error: "Length should be whole hours and minutes, minutes under 60." };
  const language = languageFrom(text(formData, "language"));
  if (language === "invalid") return { ok: false, error: "That language is not one this server knows." };
  const url = urlFrom(text(formData, "url"));
  if (url === "invalid") return { ok: false, error: "The link should start with http:// or https://." };

  const base = text(formData, "baseEditionId");
  if (base && !isUuid(base)) return { ok: false, error: "That base edition is not on this server." };
  const shelf = text(formData, "shelf");

  try {
    const added = await addEdition({
      userId,
      work,
      edition: {
        kind,
        name: text(formData, "name").slice(0, 200) || null,
        format,
        baseEditionId: base || null,
        credit: text(formData, "credit").slice(0, 200) || null,
        durationMinutes: duration,
        language,
        url,
        notes: text(formData, "notes").slice(0, 5000) || null,
      },
      shelf: isShelf(shelf) ? shelf : "tbr",
    });
    return { ok: true, added, format };
  } catch (error) {
    if (error instanceof AddBookError) return { ok: false, error: error.message };
    if (error instanceof OpenLibraryError) return { ok: false, error: `${error.message}. Nothing was added; try again in a moment.` };
    throw error;
  }
}

/** Door B's book, as `/add?work=` shows it: its title, Open Library key, and editions to base one on. */
export async function byHandWork(workId: string) {
  if (!isUuid(workId)) return null;
  const [work] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, authors: works.authors, olWorkKey: works.olWorkKey })
    .from(works)
    .where(eq(works.id, workId));
  if (!work) return null;
  const rows = await db
    .select({ id: editions.id, name: editions.name, language: editions.language })
    .from(editions)
    .where(eq(editions.workId, work.id))
    .orderBy(asc(editions.createdAt));
  return { ...work, editions: rows };
}

export function byHandLanguages() {
  return languageOptions();
}
