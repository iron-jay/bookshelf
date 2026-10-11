"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { addOpenLibraryBook, AddBookError } from "@/lib/books/add";
import { addEdition, type WorkTarget } from "@/lib/books/add-edition";
import { addFromCatalogue } from "@/lib/books/add-from-catalogue";
import { parsePosition } from "@/lib/books/series";
import { comicTitle, getIssue, getVolume } from "@/lib/comicvine";
import { getBook } from "@/lib/hardcover";
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
  const title = text(formData, "title");

  if (workId) return isUuid(workId) ? { kind: "existing", workId } : "That link is broken.";
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
  redirect(`/?added=${result.entryId}`);
}

function positiveId(formData: FormData, name: string): number | null {
  const n = Number(text(formData, name));
  return Number.isInteger(n) && n > 0 && n < 2_147_483_648 ? n : null;
}

/**
 * A book only Hardcover has, from search (§4b). The page sends its id; the
 * details are Hardcover's own answer, fetched here. It becomes a local work
 * with those details, as the import makes one.
 */
export async function addHardcoverBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();
  const id = positiveId(formData, "hardcoverId");
  const format = text(formData, "format");
  const shelf = text(formData, "shelf");
  if (!id) return { error: "That link is broken. Search for the book again." };
  if (!isFormat(format)) return { error: "Choose Book or Audiobook." };

  const book = await getBook(id);
  if (!book) return { error: "Hardcover did not answer just now. Nothing was added; try again in a moment." };

  // Hardcover often repeats the end of the title as the subtitle.
  const subtitle = book.subtitle && !book.title.toLowerCase().endsWith(book.subtitle.toLowerCase()) ? book.subtitle : null;
  const result = await addFromCatalogue({
    userId: user.id,
    book: {
      key: { hardcoverId: book.id },
      title: book.title,
      subtitle,
      authors: book.authors,
      summary: book.description,
      year: book.releaseYear,
      series: book.series,
      coverUrl: book.imageUrl,
      coverSource: "hardcover",
      source: "local",
    },
    format,
    shelf: isShelf(shelf) ? shelf : "tbr",
  });

  await rememberFormat(format);
  revalidatePath("/");
  redirect(`/?${result.added ? "added" : "already"}=${result.entryId}`);
}

/**
 * A comic or graphic novel from Comic Vine: one issue, which may be a single
 * issue, a trade paperback or a graphic novel. Its volume is its series when
 * the volume has more than one issue, numbered by the issue.
 */
export async function addComicBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();
  const issueId = positiveId(formData, "issueId");
  const shelf = text(formData, "shelf");
  if (!issueId) return { error: "Choose which one to add." };

  const issue = await getIssue(issueId);
  const volume = issue?.volume ? await getVolume(issue.volume.id) : null;
  if (!issue || !volume) return { error: "Comic Vine did not answer just now. Nothing was added; try again in a moment." };

  const position = issue.issueNumber ? parsePosition(issue.issueNumber) : null;
  const result = await addFromCatalogue({
    userId: user.id,
    book: {
      key: { comicvineIssueId: issue.id },
      title: comicTitle(volume.name, issue, volume.issueCount),
      subtitle: null,
      authors: issue.authors,
      summary: issue.description,
      year: issue.year,
      series:
        volume.issueCount > 1 ? { name: volume.name, position: typeof position === "number" ? position : null } : null,
      coverUrl: issue.coverUrl,
      coverSource: "comicvine",
      source: "comicvine",
    },
    format: "book",
    shelf: isShelf(shelf) ? shelf : "tbr",
  });

  revalidatePath("/");
  redirect(`/?${result.added ? "added" : "already"}=${result.entryId}`);
}
