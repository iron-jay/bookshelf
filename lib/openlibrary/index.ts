/**
 * What the rest of the app may ask Open Library. Read-only: nothing here
 * writes to the database, and search results are never cached (brief §4).
 */
import type { Isbn } from "@/lib/isbn";

import { getJson } from "./client";
import {
  bareKey,
  coverId,
  formatOf,
  languageOf,
  textOf,
  yearOf,
} from "./normalise";
import type { OlEdition, OlSearchDoc, OlSearchResponse } from "./types";

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
  if (!workKey) return { edition, work: null };

  const response = await getJson<OlSearchResponse>("/search.json", {
    q: `key:/works/${workKey}`,
    fields: SEARCH_FIELDS,
    limit: "1",
  });
  const doc = response?.docs?.[0];

  return { edition, work: doc ? toWorkSummary(doc) : null };
}
