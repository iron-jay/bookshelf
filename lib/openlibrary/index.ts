/**
 * What the rest of the app may ask Open Library. Read-only: nothing here
 * writes to the database, and search results are never cached (brief §4).
 */
import type { Isbn } from "@/lib/isbn";

import { getJson } from "./client";
import {
  bareKey,
  coverId,
  descriptionOf,
  formatOf,
  languageOf,
  narratorsOf,
  publishedOnOf,
  textOf,
  yearOf,
} from "./normalise";
import type {
  OlEdition,
  OlEditionsResponse,
  OlSearchDoc,
  OlSearchResponse,
  OlWork,
} from "./types";

export { OpenLibraryError } from "./client";
export { coverUrl } from "./normalise";

export type OlWorkSummary = {
  olWorkKey: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  firstPublishedYear: number | null;
  coverId: number | null;
  editionCount: number | null;
};

export type OlEditionSummary = {
  olEditionKey: string;
  /** The work Open Library files this edition under. */
  olWorkKey: string | null;
  title: string | null;
  publisher: string | null;
  year: number | null;
  format: "book" | "audiobook";
  /** The format as Open Library wrote it, for display beside the toggle. */
  physicalFormat: string | null;
  language: string | null;
  pages: number | null;
  coverId: number | null;
  isbn13: string | null;
  isbn10: string | null;
  /** Prefill for "Read by", from the record's contributors. */
  narrators: string[];
  /** Only when the record names a day; see publishedOnOf. */
  publishedOn: string | null;
};

const SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "cover_i",
  "edition_count",
].join(",");

function toWorkSummary(doc: OlSearchDoc): OlWorkSummary | null {
  const olWorkKey = bareKey(doc.key);
  const title = textOf(doc.title);
  // A result without a key cannot be added, and one without a title cannot
  // be recognised. Neither is worth showing.
  if (!olWorkKey || !title) return null;

  return {
    olWorkKey,
    title,
    subtitle: textOf(doc.subtitle),
    authors: (doc.author_name ?? []).map((name) => name.trim()).filter(Boolean),
    firstPublishedYear: doc.first_publish_year ?? null,
    coverId: coverId(doc.cover_i),
    editionCount: doc.edition_count ?? null,
  };
}

export async function searchWorks(query: string, limit = 20): Promise<OlWorkSummary[]> {
  const response = await getJson<OlSearchResponse>("/search.json", {
    q: query,
    fields: SEARCH_FIELDS,
    limit: String(limit),
  });

  return (response?.docs ?? []).flatMap((doc) => toWorkSummary(doc) ?? []);
}

function toEditionSummary(edition: OlEdition): OlEditionSummary | null {
  const olEditionKey = bareKey(edition.key);
  if (!olEditionKey) return null;

  return {
    olEditionKey,
    olWorkKey: bareKey(edition.works?.[0]?.key),
    title: textOf(edition.title),
    publisher: textOf(edition.publishers?.[0]),
    year: yearOf(edition.publish_date),
    format: formatOf(edition.physical_format),
    physicalFormat: textOf(edition.physical_format),
    language: languageOf(edition.languages?.[0]?.key),
    pages: edition.number_of_pages && edition.number_of_pages > 0 ? edition.number_of_pages : null,
    coverId: coverId(edition.covers?.[0]),
    isbn13: textOf(edition.isbn_13?.[0]),
    isbn10: textOf(edition.isbn_10?.[0]),
    narrators: narratorsOf(edition.contributors),
    publishedOn: publishedOnOf(edition.publish_date),
  };
}

export type IsbnLookup = {
  edition: OlEditionSummary;
  /** Null when Open Library has an edition that belongs to no work — rare, but real. */
  work: OlWorkSummary | null;
};

/**
 * An ISBN names an edition; the work comes from the edition's `works` link.
 *
 * The work is fetched through search.json by key rather than /works/{key}.json,
 * because search already carries author *names*. The works endpoint has only
 * author keys, and resolving those would cost an /authors request each — two
 * requests where search needs one, in a queue that runs at one a second.
 */
export async function lookupIsbn(isbn: Isbn): Promise<IsbnLookup | null> {
  const raw = await getJson<OlEdition>(`/isbn/${isbn.isbn13}.json`);
  const edition = raw ? toEditionSummary(raw) : null;
  if (!raw || !edition) return null;

  const workKey = bareKey(raw.works?.[0]?.key);
  return { edition, work: workKey ? await getWorkSummary(workKey) : null };
}

/**
 * The edition an ISBN names, without its work's summary: for the Goodreads
 * import, which already has the author names and so saves a queued request.
 */
export async function getEditionByIsbn(isbn13: string): Promise<OlEditionSummary | null> {
  const raw = await getJson<OlEdition>(`/isbn/${isbn13}.json`);
  return raw ? toEditionSummary(raw) : null;
}

/** Open Library's keys are OL, digits, and one letter for the record type. */
export function isWorkKey(value: string): boolean {
  return /^OL\d+W$/.test(value);
}

export function isEditionKey(value: string): boolean {
  return /^OL\d+M$/.test(value);
}

/**
 * A work's title, author names and cover through search.json by key: the one
 * endpoint that carries author names, where /works/ has only author keys.
 */
export async function getWorkSummary(olWorkKey: string): Promise<OlWorkSummary | null> {
  const response = await getJson<OlSearchResponse>("/search.json", {
    q: `key:/works/${olWorkKey}`,
    fields: SEARCH_FIELDS,
    limit: "1",
  });
  const doc = response?.docs?.[0];
  return doc ? toWorkSummary(doc) : null;
}

export type OlWorkRecord = {
  /** Stored verbatim in works.ol_payload so fields can be re-derived later. */
  payload: OlWork;
  summary: string | null;
  coverId: number | null;
  authorKeys: string[];
};

export async function getWorkRecord(olWorkKey: string): Promise<OlWorkRecord | null> {
  const payload = await getJson<OlWork>(`/works/${olWorkKey}.json`);
  if (!payload) return null;

  return {
    payload,
    summary: descriptionOf(payload.description),
    coverId: coverId(payload.covers?.[0]),
    authorKeys: (payload.authors ?? []).flatMap((a) => bareKey(a.author?.key) ?? []),
  };
}

/**
 * Open Library serves at most 1000 editions a page. A work with more than that
 * (Pride and Prejudice has over 4000) gets the first page and the total, and
 * the picker says so: paging through the rest would be four more queued
 * requests to show a list nobody scrolls, when an ISBN search finds the one
 * edition directly.
 */
export const EDITIONS_PAGE = 1000;

export async function getEditions(
  olWorkKey: string,
): Promise<{ editions: OlEditionSummary[]; total: number } | null> {
  const response = await getJson<OlEditionsResponse>(`/works/${olWorkKey}/editions.json`, {
    limit: String(EDITIONS_PAGE),
  });
  if (!response) return null;

  const editions = (response.entries ?? []).flatMap((e) => toEditionSummary(e) ?? []);
  return { editions, total: response.size ?? editions.length };
}

export async function getEdition(olEditionKey: string): Promise<OlEditionSummary | null> {
  const raw = await getJson<OlEdition>(`/books/${olEditionKey}.json`);
  return raw ? toEditionSummary(raw) : null;
}
