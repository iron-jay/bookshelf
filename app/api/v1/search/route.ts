import { json, withUser } from "@/lib/api";
import { findLocalEdition, searchLocal } from "@/lib/books/search";
import { mergeResults, type Cover, type SearchResult } from "@/lib/books/search-results";
import { hardcoverEnabled, searchBooks } from "@/lib/hardcover";
import { parseIsbn } from "@/lib/isbn";
import { coverUrl, lookupIsbn, OpenLibraryError, searchWorks } from "@/lib/openlibrary";

export const dynamic = "force-dynamic";

function coverOf(cover: Cover): string | null {
  if (!cover) return null;
  return cover.kind === "openlibrary" ? coverUrl(cover.id, "M") : cover.url;
}

/** What the phone needs to open or add a result: ids rather than web paths. */
function resultJson(result: SearchResult) {
  const [prefix, ...rest] = result.key.split("-");
  const id = rest.join("-");
  return {
    title: result.title,
    subtitle: result.subtitle,
    authors: result.authors,
    year: result.year,
    coverUrl: coverOf(result.cover),
    provenance: result.provenance,
    editionCount: result.editionCount,
    onShelf: result.onShelf,
    workId: prefix === "local" ? id : null,
    olWorkKey: prefix === "ol" ? id : null,
    hardcoverId: prefix === "hc" ? Number(id) : null,
    // The web page this result opens, for anything the phone does not show itself.
    webPath: result.href ?? result.addHref,
  };
}

function failure(error: unknown): string {
  if (error instanceof OpenLibraryError) {
    return error.status === 429 ? "rate_limited" : `failed (${error.status ?? "no response"})`;
  }
  return "failed";
}

/**
 * `?q=` across this server, Open Library and Hardcover, merged and ranked the
 * way the search page does it. An ISBN answers with the one edition instead.
 * Local results come back with the network down; `catalogueError` then says
 * why the rest is missing.
 */
export const GET = withUser(async (request, { user }) => {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!term) return json({ q: term, results: [], isbn: null, catalogueError: null });

  const isbn = parseIsbn(term);
  if (isbn.kind === "isbn") {
    const local = await findLocalEdition(user.id, isbn.isbn);
    if (local) {
      return json({
        q: term,
        results: [],
        isbn: { editionId: local.editionId, editionName: local.editionName, workSlug: local.work.slug, remote: null },
        catalogueError: null,
      });
    }
    try {
      const remote = await lookupIsbn(isbn.isbn);
      return json({
        q: term,
        results: [],
        isbn: remote
          ? {
              editionId: null,
              editionName: remote.edition.title ?? null,
              workSlug: null,
              remote: { olWorkKey: remote.work?.olWorkKey ?? null, title: remote.work?.title ?? null },
            }
          : null,
        catalogueError: null,
      });
    } catch (error) {
      return json({ q: term, results: [], isbn: null, catalogueError: failure(error) });
    }
  }

  // Local first and regardless of the network, so an offline server still
  // finds everything it has already cached.
  const local = await searchLocal(user.id, term);
  let catalogueError: string | null = null;
  const [remote, hardcover] = await Promise.all([
    searchWorks(term).catch((error: unknown) => {
      catalogueError = failure(error);
      return [];
    }),
    hardcoverEnabled() ? searchBooks(term, 10) : Promise.resolve([]),
  ]);

  return json({
    q: term,
    results: mergeResults(term, local, remote, hardcover).map(resultJson),
    isbn: null,
    catalogueError,
  });
});
