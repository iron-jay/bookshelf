/**
 * The only place in the app that talks to Hardcover (hardcover.app), an
 * optional source for books Open Library does not have. Used for three
 * things: filling in local works on import, a manual fill-in run for works
 * already here, and covers (lookup and the picker).
 *
 * Optional like Google Books: with no HARDCOVER_API_TOKEN nothing here makes
 * a request, and every failure — a rejected token, a 429, no network — comes
 * back as "nothing found", never as a failed add or import. Hardcover's API is
 * in beta and it may reset tokens without notice (its docs, 2026-09); when
 * that happens, bookshelf simply stops getting Hardcover data until a new
 * token is set.
 *
 * Free plan: 60 requests a minute (bursts of 10), 5,000 a day, one search per
 * request. Personal use; its terms forbid training AI models on the data.
 */
import { version } from "@/package.json";
import { sameTitle, shareAnAuthor, titleQueries } from "@/lib/books/titles";
import { parseIsbn } from "@/lib/isbn";
import { createSerialiser } from "@/lib/rate-limit";

const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const serialise = createSerialiser(1100);

function token(): string {
  // People paste it with or without the scheme; the header adds it back.
  return (process.env.HARDCOVER_API_TOKEN ?? "").replace(/^Bearer\s+/i, "").trim();
}

export function hardcoverEnabled(): boolean {
  return token() !== "";
}

let warnedAboutToken = false;

async function request<T>(query: string, variables: Record<string, unknown>, retried = false): Promise<T | null> {
  if (!hardcoverEnabled()) return null;
  return serialise(async () => {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
          // Hardcover asks scripts to describe themselves.
          "User-Agent": `bookshelf/${version} (${process.env.OPENLIBRARY_CONTACT?.trim() || "+https://github.com/iron-jay/bookshelf"})`,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 401 || res.status === 403) {
        if (!warnedAboutToken) console.warn(`[hardcover] token rejected (${res.status}); set a new HARDCOVER_API_TOKEN`);
        warnedAboutToken = true;
        return null;
      }
      if (res.status === 429 && !retried) {
        // Over the per-minute bucket: wait for it to refill once, then give up.
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        return request<T>(query, variables, true);
      }
      if (!res.ok) {
        console.warn(`[hardcover] ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { data?: T; errors?: unknown };
      if (body.errors) console.warn("[hardcover] query errors", JSON.stringify(body.errors).slice(0, 300));
      return body.data ?? null;
    } catch {
      console.warn("[hardcover] no response");
      return null;
    }
  });
}

type Doc = {
  id?: number | string;
  slug?: string;
  title?: string;
  subtitle?: string;
  author_names?: string[];
  alternative_titles?: string[];
  description?: string;
  image?: { url?: string };
  isbns?: string[];
  featured_series?: { series?: { name?: string } };
  featured_series_position?: number | null;
  release_year?: number | null;
};

export type HardcoverBook = {
  id: number;
  title: string;
  subtitle: string | null;
  authors: string[];
  alternativeTitles: string[];
  description: string | null;
  imageUrl: string | null;
  /** A valid ISBN-13 from the book's editions, when it lists one. */
  isbn13: string | null;
  series: { name: string; position: number | null } | null;
  releaseYear: number | null;
};

function toBook(doc: Doc): HardcoverBook | null {
  const id = Number(doc.id);
  const title = doc.title?.trim();
  if (!Number.isInteger(id) || id <= 0 || !title) return null;

  const isbn = (doc.isbns ?? []).map((value) => parseIsbn(value)).find((p) => p.kind === "isbn");
  const seriesName = doc.featured_series?.series?.name?.trim();
  const position = doc.featured_series_position;
  // Hardcover's images are its users' uploads; only one on its own asset host
  // is taken, so nothing else can be smuggled in as "a Hardcover cover".
  const image = doc.image?.url && /^https:\/\/assets\.hardcover\.app\//.test(doc.image.url) ? doc.image.url : null;

  return {
    id,
    title,
    subtitle: doc.subtitle?.trim() || null,
    authors: (doc.author_names ?? []).map((a) => a.trim()).filter(Boolean),
    alternativeTitles: (doc.alternative_titles ?? []).filter((t) => typeof t === "string"),
    description: doc.description?.trim() || null,
    imageUrl: image,
    isbn13: isbn?.kind === "isbn" ? isbn.isbn.isbn13 : null,
    series: seriesName
      ? { name: seriesName, position: typeof position === "number" && position >= 0 && position < 10_000 ? position : null }
      : null,
    releaseYear: typeof doc.release_year === "number" && doc.release_year > 0 && doc.release_year < 3000 ? doc.release_year : null,
  };
}

/** Hardcover's own search, as its website runs it. One request. */
export async function searchBooks(query: string, perPage = 10): Promise<HardcoverBook[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const data = await request<{ search?: { results?: { hits?: { document: Doc }[] } } }>(
    `query($q: String!, $n: Int!) { search(query: $q, query_type: "Book", per_page: $n, page: 1) { results } }`,
    { q, n: perPage },
  );
  return (data?.search?.results?.hits ?? []).flatMap((hit) => toBook(hit.document) ?? []);
}

/**
 * The same book on Hardcover, or null — strictly, as the Goodreads import
 * judges Open Library: a matching title (Hardcover's alternative titles count,
 * which is how Japanese manga titles find their English entries) and a shared
 * author surname. Tries the title's forms first, since Hardcover's search is
 * tuned for titles and weighs authors lightly; the title with the author's name
 * comes last, for books filed under a longer title.
 */
export async function findBook(title: string, authors: string[]): Promise<HardcoverBook | null> {
  if (!hardcoverEnabled()) return null;
  const { search, match } = titleQueries(title);
  const queries = [...search, authors[0] ? `${search[0]} ${authors[0]}` : ""].filter(Boolean);

  for (const query of [...new Set(queries)]) {
    const hits = (await searchBooks(query)).filter(
      (book) =>
        shareAnAuthor(book.authors, authors) &&
        (match.some((mine) => sameTitle(book.title, book.subtitle, mine)) ||
          book.alternativeTitles.some((alt) => match.some((mine) => sameTitle(alt, null, mine)))),
    );
    // Hardcover often holds the same book more than once (different uploads).
    // Every one of these passed the same strict test, so take the fullest —
    // the first can be a bare duplicate with no cover while its twin has one.
    if (hits.length > 0) return hits.reduce((best, book) => (completeness(book) > completeness(best) ? book : best));
  }
  return null;
}

function completeness(book: HardcoverBook): number {
  return (book.imageUrl ? 4 : 0) + (book.description ? 2 : 0) + (book.isbn13 ? 1 : 0) + (book.series ? 1 : 0);
}

/**
 * A book's cover address by its id alone, for the picker: the page sends an
 * id, and the address downloaded is Hardcover's own answer, never the page's.
 */
export async function coverUrlForBook(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const data = await request<{ books_by_pk?: { image?: { url?: string } | null } | null }>(
    `query($id: Int!) { books_by_pk(id: $id) { image { url } } }`,
    { id },
  );
  const url = data?.books_by_pk?.image?.url;
  return url && /^https:\/\/assets\.hardcover\.app\//.test(url) ? url : null;
}
