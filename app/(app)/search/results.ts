import { sameTitle, shareAnAuthor } from "@/lib/books/titles";
import type { HardcoverBook } from "@/lib/hardcover";
import type { OlWorkSummary } from "@/lib/openlibrary";

export type LocalWork = {
  id: string;
  slug: string;
  olWorkKey: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  firstPublishedYear: number | null;
  coverUrl: string | null;
  source: "openlibrary" | "local" | "comicvine";
  /** The Hardcover book it was added from or filled in by, if any. */
  hardcoverId: number | null;
  /** Your entries on this work's editions. */
  entryEditionIds: string[];
};

export type Cover =
  | { kind: "openlibrary"; id: number }
  | { kind: "local"; url: string }
  /** Hardcover's art, shown from its own host until the book is added. */
  | { kind: "remote"; url: string }
  | null;

export type SearchResult = {
  key: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  year: number | null;
  cover: Cover;
  /**
   * Where the result lives. "local" is a work no catalogue had — a zine, an
   * ARC. "saved" is an Open Library work already on this server, "comic" a
   * Comic Vine one. "hardcover" is a book only Hardcover has, not added yet.
   */
  provenance: "openlibrary" | "saved" | "local" | "comic" | "hardcover";
  editionCount: number | null;
  /** Set when there is somewhere on this server to go. */
  href: string | null;
  /** Set for anything Open Library knows: the add page for it. */
  addHref: string | null;
  onShelf: boolean;
};

function addHrefFor(olWorkKey: string | null): string | null {
  return olWorkKey ? `/add/book/${olWorkKey}` : null;
}

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Coarse on purpose: three tiers and a tie. Open Library's own ranking is good
 * and is kept within each tier; this only has to lift an exact or leading
 * title match — most often a local fic nobody else has heard of — above the
 * general noise of a remote search.
 */
function score(query: string, title: string, authors: string[]): number {
  const q = fold(query);
  const t = fold(title);
  if (!q) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  const haystack = `${t} ${fold(authors.join(" "))}`.split(" ");
  return q.split(" ").every((word) => haystack.some((w) => w.startsWith(word))) ? 1 : 0;
}

/**
 * Where a work on this server should open: the entry when you have exactly one,
 * the work page otherwise. With two editions shelved there is no single entry
 * to open, and guessing between them would be worse than letting you pick.
 */
function hrefFor(work: LocalWork): string {
  return work.entryEditionIds.length === 1
    ? `/edition/${work.entryEditionIds[0]}`
    : `/work/${work.slug}`;
}

function fromLocal(work: LocalWork): SearchResult {
  return {
    key: `local-${work.id}`,
    title: work.title,
    subtitle: work.subtitle,
    authors: work.authors,
    year: work.firstPublishedYear,
    cover: work.coverUrl ? { kind: "local", url: work.coverUrl } : null,
    provenance: work.source === "local" ? "local" : work.source === "comicvine" ? "comic" : "saved",
    editionCount: null,
    href: hrefFor(work),
    // Local works — fics, zines — gain editions from their own work page
    // (build step 6), not from Open Library's add flow.
    addHref: addHrefFor(work.olWorkKey),
    onShelf: work.entryEditionIds.length > 0,
  };
}

/**
 * One list, not three blocks. An Open Library result that is already on this
 * server becomes the local row — same work, shown once, with your shelf state —
 * and everything is then ordered by how well its title matches.
 *
 * Hardcover's results are for what Open Library lacks (§4b), so one is kept
 * only when it is neither here already (by its id) nor the same book as an
 * Open Library result — judged by the import's strict rule, same title and a
 * shared surname — and it sits after the others of its tier.
 */
export function mergeResults(
  query: string,
  local: LocalWork[],
  remote: OlWorkSummary[],
  hardcover: HardcoverBook[] = [],
): SearchResult[] {
  const localByKey = new Map(
    local.flatMap((work) => (work.olWorkKey ? [[work.olWorkKey, work] as const] : [])),
  );
  const claimed = new Set<string>();

  const fromRemote = remote.map((ol): SearchResult => {
    const saved = localByKey.get(ol.olWorkKey);
    if (saved) {
      claimed.add(saved.id);
      return { ...fromLocal(saved), editionCount: ol.editionCount };
    }
    return {
      key: `ol-${ol.olWorkKey}`,
      title: ol.title,
      subtitle: ol.subtitle,
      authors: ol.authors,
      year: ol.firstPublishedYear,
      cover: ol.coverId ? { kind: "openlibrary", id: ol.coverId } : null,
      provenance: "openlibrary",
      editionCount: ol.editionCount,
      href: null,
      addHref: addHrefFor(ol.olWorkKey),
      onShelf: false,
    };
  });

  const localOnly = local.filter((work) => !claimed.has(work.id)).map(fromLocal);

  const hereAlready = new Set(local.flatMap((work) => (work.hardcoverId ? [work.hardcoverId] : [])));
  const fromHardcover = hardcover
    .filter(
      (book) =>
        !hereAlready.has(book.id) &&
        !remote.some(
          (ol) => shareAnAuthor(ol.authors, book.authors) && sameTitle(ol.title, ol.subtitle, book.title),
        ),
    )
    .map(
      (book): SearchResult => ({
        key: `hc-${book.id}`,
        title: book.title,
        subtitle: book.subtitle,
        authors: book.authors,
        year: book.releaseYear,
        cover: book.imageUrl ? { kind: "remote", url: book.imageUrl } : null,
        provenance: "hardcover",
        editionCount: null,
        href: null,
        addHref: `/add/hardcover/${book.id}`,
        onShelf: false,
      }),
    );

  // Array.prototype.sort is stable, so Open Library's order survives within a
  // tier and local-only works and Hardcover's sit after it at the same score.
  return [...fromRemote, ...localOnly, ...fromHardcover]
    .map((result) => ({ result, score: score(query, result.title, result.authors) }))
    .sort((a, b) => b.score - a.score)
    .map(({ result }) => result);
}
