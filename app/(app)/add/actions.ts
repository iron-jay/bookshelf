"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { addOpenLibraryBook, AddBookError } from "@/lib/books/add";
import { addEdition, type WorkTarget } from "@/lib/books/add-edition";
import { addFromCatalogue, comicBook, hardcoverBook } from "@/lib/books/add-from-catalogue";
import { addGoodreadsBook } from "@/lib/books/add-from-goodreads";
import { checkPageData } from "@/lib/books/goodreads-fill";
import { readBookDraft } from "@/lib/books/draft";
import { editionKind } from "@/lib/db/schema";
import { parseIsbn } from "@/lib/isbn";
import { isEditionKey, isWorkKey, OpenLibraryError } from "@/lib/openlibrary";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

import { FORMAT_COOKIE, isFormat, type Format } from "./format";

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
  const draft = readBookDraft(formData);
  if (draft && !draft.ok) return { error: draft.error };

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
      draft: draft?.draft,
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
  redirect(landing(formData, result));
}

/**
 * Where an add lands: the shelf, saying what was added, or the new edition's
 * cover page when the form asked to choose a different one.
 */
function landing(formData: FormData, result: { editionId: string; entryId: string; added: boolean }): string {
  if (formData.get("then") === "cover") return `/edition/${result.editionId}/cover`;
  return `/?${result.added ? "added" : "already"}=${result.entryId}`;
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

/**
 * The one form for typed-in editions (brief §5): Door A's manual book, and
 * Door B's "Add edition" on a work page.
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
  redirect(landing(formData, { ...result, added: true }));
}

function positiveId(formData: FormData, name: string): number | null {
  const n = Number(text(formData, name));
  return Number.isInteger(n) && n > 0 && n < 2_147_483_648 ? n : null;
}

/**
 * A book only Hardcover has, from search (§4b). The page sends its id; the
 * details are Hardcover's own answer, fetched here.
 */
export async function addHardcoverBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();
  const id = positiveId(formData, "hardcoverId");
  const format = text(formData, "format");
  const shelf = text(formData, "shelf");
  if (!id) return { error: "That link is broken. Search for the book again." };
  if (!isFormat(format)) return { error: "Choose Book or Audiobook." };

  const draft = readBookDraft(formData);
  if (draft && !draft.ok) return { error: draft.error };

  const book = await hardcoverBook(id);
  if (!book) return { error: "Hardcover did not answer just now. Nothing was added; try again in a moment." };

  const result = await addFromCatalogue({
    userId: user.id,
    book,
    format,
    shelf: isShelf(shelf) ? shelf : "tbr",
    draft: draft?.draft,
  });

  await rememberFormat(format);
  revalidatePath("/");
  redirect(landing(formData, result));
}

/** A comic or graphic novel from Comic Vine: one issue (§4c). */
export async function addComicBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();
  const issueId = positiveId(formData, "issueId");
  const shelf = text(formData, "shelf");
  if (!issueId) return { error: "Choose which one to add." };
  const draft = readBookDraft(formData);
  if (draft && !draft.ok) return { error: draft.error };

  const book = await comicBook(issueId);
  if (!book) return { error: "Comic Vine did not answer just now. Nothing was added; try again in a moment." };

  const result = await addFromCatalogue({
    userId: user.id,
    book,
    format: "book",
    shelf: isShelf(shelf) ? shelf : "tbr",
    draft: draft?.draft,
  });

  revalidatePath("/");
  redirect(landing(formData, result));
}

/**
 * A book from its own Goodreads page (the Firefox extension or the
 * bookmarklet, by way of /goodreads-fill). The page's details come back as a
 * hidden field and are checked as the fill checks them; where the book goes
 * is worked out again here.
 */
export async function addFromGoodreads(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();
  let raw: unknown = null;
  try {
    raw = JSON.parse(text(formData, "goodreads"));
  } catch {}
  const data = checkPageData(raw);
  const format = text(formData, "format");
  const shelf = text(formData, "shelf");
  if (!data) return { error: "That did not look like a Goodreads book page." };
  if (!isFormat(format)) return { error: "Choose Book or Audiobook." };

  const draft = readBookDraft(formData);
  if (draft && !draft.ok) return { error: draft.error };

  const result = await addGoodreadsBook({
    userId: user.id,
    data,
    format,
    shelf: isShelf(shelf) ? shelf : "tbr",
    draft: draft?.draft,
  });
  if ("error" in result) return result;

  await rememberFormat(format);
  revalidatePath("/");
  redirect(landing(formData, result));
}
