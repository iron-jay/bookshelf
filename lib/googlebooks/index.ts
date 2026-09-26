/**
 * The only place in the app that talks to Google Books (brief §4a). Used for
 * one thing: a cover when Open Library has none.
 *
 * Every failure — no key and the shared anonymous quota spent, a 429, no
 * network — comes back as "no cover". A missing cover never fails an add, so
 * there is nothing for a caller to do with the difference except log it.
 *
 * Unauthenticated requests draw on a quota shared with every other anonymous
 * caller on the internet, and on 2026-09-25 it was already exhausted for the
 * day by mid-morning. In practice this needs GOOGLE_BOOKS_API_KEY.
 */
import { createSerialiser } from "@/lib/rate-limit";

const serialise = createSerialiser(1000);

type Volume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

export type GoogleCover = { volumeId: string; url: string };

async function volumes(query: string, maxResults: number): Promise<Volume[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("fields", "items(id,volumeInfo(title,authors,imageLinks))");
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  if (key) url.searchParams.set("key", key);

  return serialise(async () => {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        console.warn(`[googlebooks] ${res.status} for ${query}${key ? "" : " (no API key)"}`);
        return [];
      }
      const body = (await res.json()) as { items?: Volume[] };
      return body.items ?? [];
    } catch {
      console.warn(`[googlebooks] no response for ${query}`);
      return [];
    }
  });
}

/**
 * Google's thumbnail URLs come as http with a page-curl effect baked in.
 * zoom=1 is the largest size Google reliably serves; higher zooms often come
 * back as an "image not available" card rather than an error.
 */
function coverFrom(volume: Volume): GoogleCover | null {
  const link = volume.volumeInfo?.imageLinks?.thumbnail ?? volume.volumeInfo?.imageLinks?.smallThumbnail;
  if (!volume.id || !link) return null;

  const url = new URL(link.replace(/^http:/, "https:"));
  url.searchParams.delete("edge");
  url.searchParams.set("zoom", "1");
  return { volumeId: volume.id, url: url.toString() };
}

/** Exact: an ISBN names one edition, so the cover is that edition's. */
export async function coverByIsbn(isbn13: string): Promise<GoogleCover | null> {
  const [volume] = await volumes(`isbn:${isbn13}`, 1);
  return volume ? coverFrom(volume) : null;
}

/**
 * Fuzzy: the first title-and-author hit with a cover. Right more often than
 * not, which is exactly why anything applied from here is flagged for review.
 */
export async function coverByTitle(title: string, author: string | null): Promise<GoogleCover | null> {
  const quoted = (text: string) => `"${text.replace(/"/g, "")}"`;
  const query = author
    ? `intitle:${quoted(title)} inauthor:${quoted(author)}`
    : `intitle:${quoted(title)}`;
  for (const volume of await volumes(query, 5)) {
    const cover = coverFrom(volume);
    if (cover) return cover;
  }
  return null;
}

export type GoogleCandidate = GoogleCover & { title: string };

/**
 * Every volume with art for a query, for the cover picker — where a person
 * chooses, so the first hit is not taken on trust as the lookups above do.
 * `query` is Google's own syntax: "isbn:…", or free text.
 */
export async function coverCandidates(query: string, max = 10): Promise<GoogleCandidate[]> {
  return (await volumes(query, max)).flatMap((volume) => {
    const cover = coverFrom(volume);
    return cover ? [{ ...cover, title: volume.volumeInfo?.title ?? "" }] : [];
  });
}

/**
 * A volume's cover by id alone, built rather than fetched, so the picker can
 * be sent a volume id and never an address. Ids are Google's short
 * alphanumeric strings; anything else is refused.
 */
export function coverUrlForVolume(volumeId: string): string | null {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(volumeId)) return null;
  return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=1`;
}
