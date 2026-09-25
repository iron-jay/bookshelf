"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { and, ilike, inArray, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { addOpenLibraryBook, AddBookError } from "@/lib/books/add";
import { addEdition, type WorkTarget } from "@/lib/books/add-edition";
import { db } from "@/lib/db";
import { editionKind, editions, works } from "@/lib/db/schema";
import { parseIsbn } from "@/lib/isbn";
import { isEditionKey, isWorkKey, OpenLibraryError, searchWorks } from "@/lib/openlibrary";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

import { FORMAT_COOKIE, isFormat, type Format } from "./format";
import type { SourceResult } from "./source-types";

export type AddState = { error: string | null };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Whole hours and minutes, both optional; null when neither adds up to anything. */
function durationFrom(formData: FormData): number | null | "invalid" {
  const hours = text(formData, "hours");
  const minutes = text(formData, "minutes");
  if (!hours && !minutes) return null;

  const h = hours ? Number(hours) : 0;
  const m = minutes ? Number(minutes) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return "invalid";
  return h * 60 + m || null;
}

export async function addBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();

  const olWorkKey = text(formData, "olWorkKey");
  const olEditionKey = text(formData, "edition");
  const format = text(formData, "format");
  const shelf = text(formData, "shelf");

  if (!isWorkKey(olWorkKey) || (olEditionKey && !isEditionKey(olEditionKey))) {
    return { error: "That link is broken. Search for the book again." };
  }
  if (!isFormat(format)) {
    return { error: "Choose Book or Audiobook." };
  }

  const duration = durationFrom(formData);
  if (duration === "invalid") {
    return { error: "Length should be whole hours and minutes, minutes under 60." };
  }

  const isbn = parseIsbn(text(formData, "isbn"));
  const audio = format === "audiobook";

  let result;
  try {
    result = await addOpenLibraryBook({
      userId: user.id,
      olWorkKey,
      olEditionKey: olEditionKey || null,
      format,
      // A missing or unknown shelf is To read, which is what the picker shows
      // by default anyway.
      shelf: isShelf(shelf) ? shelf : "tbr",
      credit: audio ? text(formData, "credit") || null : null,
      durationMinutes: audio ? duration : null,
      isbn: isbn.kind === "isbn" ? isbn.isbn : null,
    });
  } catch (error) {
    if (error instanceof AddBookError) return { error: error.message };
    if (error instanceof OpenLibraryError) {
      return { error: `${error.message}. Nothing was added; try again in a moment.` };
    }
    throw error;
  }

  await rememberFormat(format);
  revalidatePath("/");
  redirect(`/?${result.added ? "added" : "already"}=${result.entryId}`);
}

async function rememberFormat(format: Format): Promise<void> {
  (await cookies()).set(FORMAT_COOKIE, format, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
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
  const olWorkKey = text(formData, "olWorkKey");
  const title = text(formData, "title");

  if (workId) return isUuid(workId) ? { kind: "existing", workId } : "That link is broken.";
  if (olWorkKey) {
    return isWorkKey(olWorkKey) ? { kind: "openlibrary", olWorkKey } : "That link is broken.";
  }
  if (!title) return "Give the book a title, or pick it from the search.";
  return { kind: "new", title: title.slice(0, 500), authors: authorsFrom(text(formData, "authors")) };
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

/**
 * The one form for typed-in editions (brief §5): Door A's fan translation and
 * manual book, and Door B's "Add edition" on a work page.
 */
export async function addEditionAction(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();

  const work = workTargetFrom(formData);
  if (typeof work === "string") return { error: work };

  const kind = text(formData, "kind");
  const format = text(formData, "format");
  if (!isEditionKind(kind)) return { error: "Choose what kind of edition this is." };
  if (!isFormat(format)) return { error: "Choose Book or Audiobook." };

  const duration = durationFrom(formData);
  if (duration === "invalid") {
    return { error: "Length should be whole hours and minutes, minutes under 60." };
  }
  const language = languageFrom(text(formData, "language"));
  if (language === "invalid") return { error: "That language is not one this server knows." };
  const url = urlFrom(text(formData, "url"));
  if (url === "invalid") return { error: "The link should start with http:// or https://." };

  const base = text(formData, "baseEditionId");
  if (base && !isUuid(base)) return { error: "That base edition is not on this server." };
  const shelf = text(formData, "shelf");

  let result;
  try {
    result = await addEdition({
      userId: user.id,
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
  } catch (error) {
    if (error instanceof AddBookError) return { error: error.message };
    if (error instanceof OpenLibraryError) {
      return { error: `${error.message}. Nothing was added; try again in a moment.` };
    }
    throw error;
  }

  await rememberFormat(format);
  revalidatePath("/");
  redirect(`/?added=${result.entryId}`);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The fan translation form's source search. Works already here come first,
 * with their editions so one can be picked as the base; then Open Library, for
 * works not cached yet. With Open Library unreachable the local half still
 * answers — `remoteFailed` lets the form say so rather than claim nothing
 * exists.
 */
export async function findSourceWorks(
  query: string,
): Promise<{ results: SourceResult[]; remoteFailed: boolean }> {
  await requireUser();
  const term = query.trim().slice(0, 200);
  if (term.length < 2) return { results: [], remoteFailed: false };

  const words = term.split(/\s+/).filter(Boolean);
  const haystack = sql`(${works.title} || ' ' || array_to_string(${works.authors}, ' '))`;
  const local = await db
    .select({
      id: works.id,
      olWorkKey: works.olWorkKey,
      title: works.title,
      authors: works.authors,
      year: works.firstPublishedYear,
    })
    .from(works)
    .where(and(...words.map((w) => ilike(haystack, `%${escapeLike(w)}%`))))
    .limit(8);

  const localEditions = local.length
    ? await db
        .select({ id: editions.id, workId: editions.workId, name: editions.name, language: editions.language })
        .from(editions)
        .where(inArray(editions.workId, local.map((w) => w.id)))
    : [];

  let remote: Awaited<ReturnType<typeof searchWorks>> = [];
  let remoteFailed = false;
  try {
    remote = await searchWorks(term, 8);
  } catch {
    remoteFailed = true;
  }

  const localKeys = new Set(local.flatMap((w) => (w.olWorkKey ? [w.olWorkKey] : [])));
  return {
    remoteFailed,
    results: [
      ...local.map(
        (w): SourceResult => ({
          kind: "local",
          workId: w.id,
          title: w.title,
          authors: w.authors,
          year: w.year,
          editions: localEditions
            .filter((e) => e.workId === w.id)
            .map((e) => ({ id: e.id, name: e.name, language: e.language })),
        }),
      ),
      // A work already cached is shown once, as the local row with its editions.
      ...remote
        .filter((r) => !localKeys.has(r.olWorkKey))
        .map(
          (r): SourceResult => ({
            kind: "openlibrary",
            olWorkKey: r.olWorkKey,
            title: r.title,
            authors: r.authors,
            year: r.firstPublishedYear,
          }),
        ),
    ],
  };
}
