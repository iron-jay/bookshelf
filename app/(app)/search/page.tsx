import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { findLocalEdition, searchLocal, type LocalEdition } from "@/lib/books/search";
import { mergeResults, type Cover, type SearchResult } from "@/lib/books/search-results";
import { hardcoverEnabled, searchBooks } from "@/lib/hardcover";
import { parseIsbn } from "@/lib/isbn";
import { languageName } from "@/lib/languages";
import {
  coverUrl,
  lookupIsbn,
  OpenLibraryError,
  searchWorks,
  type IsbnLookup,
} from "@/lib/openlibrary";


export const dynamic = "force-dynamic";

function remoteFailure(error: unknown): string {
  // Local results are still shown in every one of these cases, and the notice
  // says so: a failed remote search is not an empty one.
  if (error instanceof OpenLibraryError) {
    return error.status === 429
      ? "Open Library is asking us to slow down. Try again in a minute; local results are shown."
      : `${error.message}. Local results are shown.`;
  }
  return "Open Library search failed. Local results are shown.";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const term = q.trim();

  const isbn = term ? parseIsbn(term) : ({ kind: "not-isbn" } as const);

  let notice: string | null = null;
  let results: SearchResult[] = [];
  let localEdition: LocalEdition | null = null;
  let remoteEdition: IsbnLookup | null = null;
  let isbnMissing = false;
  let remoteFailed = false;

  if (isbn.kind === "isbn") {
    localEdition = await findLocalEdition(user.id, isbn.isbn);
    if (!localEdition) {
      try {
        remoteEdition = await lookupIsbn(isbn.isbn);
        isbnMissing = !remoteEdition;
      } catch (error) {
        notice =
          error instanceof OpenLibraryError
            ? `${error.message}, so the ISBN could not be looked up.`
            : "The ISBN could not be looked up.";
      }
    }
  } else if (term) {
    if (isbn.kind === "bad-checksum") {
      notice = `${isbn.digits} looks like an ISBN, but its check digit is wrong — probably a typo. Searching it as text instead.`;
    }

    // Local first and regardless of the network, so an offline server still
    // finds everything it has already cached.
    const local = await searchLocal(user.id, term);
    // Open Library and Hardcover each have their own queue, so they are asked
    // at once. Hardcover never fails a search: no token or no answer is none.
    const [remote, hardcover] = await Promise.all([
      searchWorks(term).catch((error: unknown) => {
        notice = remoteFailure(error);
        remoteFailed = true;
        return [];
      }),
      hardcoverEnabled() ? searchBooks(term, 10) : Promise.resolve([]),
    ]);
    results = mergeResults(term, local, remote, hardcover);
  }

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <form className="mb-6 flex gap-2" action="/search">
        <input
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Title, author or ISBN"
          aria-label="Search"
          autoFocus
          className="w-full max-w-md field"
        />
        <button
          type="submit"
          className="btn btn-primary"
        >
          Search
        </button>
      </form>

      {notice ? (
        <p role="status" className="mb-6 max-w-2xl border-l-2 border-ink-dim pl-3 font-narrow">
          {notice}
        </p>
      ) : null}

      {localEdition ? <LocalEditionResult found={localEdition} /> : null}
      {remoteEdition && isbn.kind === "isbn" ? (
        <RemoteEditionResult found={remoteEdition} isbn13={isbn.isbn.isbn13} />
      ) : null}
      {isbnMissing && isbn.kind === "isbn" ? (
        <p className="font-narrow text-ink-dim">
          Open Library has no edition with ISBN{" "}
          <span className="font-mono">{isbn.isbn.isbn13}</span>. Try the title instead.
        </p>
      ) : null}

      {/* After a failed remote search, "nothing found" would be a claim about
          Open Library that nobody checked; the notice already says what happened. */}
      {isbn.kind !== "isbn" && term && results.length === 0 && !remoteFailed ? (
        <p className="font-narrow text-ink-dim">Nothing found for “{term}”.</p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col">
          {results.map((r) => (
            <ResultRow key={r.key} result={r} />
          ))}
        </ul>
      ) : null}

      {/* The way out for what Open Library does not have (§4). Offered after
          every text search, not only an empty one: the right book is often
          missing from a page of near-misses. */}
      {term && isbn.kind !== "isbn" ? (
        <p className="mt-6 font-narrow text-ink-dim">
          Not here?{" "}
          <Link
            href={`/add?type=manual&title=${encodeURIComponent(term)}`}
            className="underline hover:text-ink"
          >
            Create it manually
          </Link>
          .
        </p>
      ) : null}
    </main>
  );
}

function Thumb({ cover }: { cover: Cover }) {
  return (
    <div className="h-18 w-12 shrink-0 bg-panel">
      {cover ? (
        <Image
          src={cover.kind === "openlibrary" ? coverUrl(cover.id, "M") : cover.url}
          alt=""
          width={48}
          height={72}
          className="h-18 w-12 object-cover"
          // Search art is transient — most of it is never added — so running it
          // through the optimiser would only fill its cache with covers of books
          // nobody kept.
          unoptimized
        />
      ) : null}
    </div>
  );
}

function provenanceLabel(result: SearchResult): string {
  const parts = [
    result.provenance === "local"
      ? "Added by hand"
      : result.provenance === "saved"
        ? "Open Library · saved here"
        : result.provenance === "comic"
          ? "Comic Vine · saved here"
          : result.provenance === "hardcover"
            ? "Hardcover"
            : "Open Library",
  ];
  if (result.editionCount && result.editionCount > 1) {
    parts.push(`${result.editionCount} editions`);
  }
  if (result.onShelf) parts.push("On your shelf");
  return parts.join(" · ");
}

function ResultRow({ result: r }: { result: SearchResult }) {
  return (
    <li className="flex items-center gap-4 border-b border-line py-3">
      <Thumb cover={r.cover} />
      <div className="min-w-0">
        <p className="truncate">
          {r.href ? (
            <Link href={r.href} className="underline hover:text-ink">
              {r.title}
            </Link>
          ) : (
            r.title
          )}
          {r.year ? <span className="ml-2 text-ink-dim">{r.year}</span> : null}
        </p>
        {r.authors.length > 0 ? (
          <p className="truncate font-narrow">{r.authors.join(", ")}</p>
        ) : null}
        <p className="font-narrow text-ink-dim">{provenanceLabel(r)}</p>
      </div>
      {r.addHref ? <AddLink href={r.addHref} again={r.onShelf} /> : null}
    </li>
  );
}

/** Plain text, like every other action: the verdigris label is for provenance only. */
function AddLink({ href, again }: { href: string; again: boolean }) {
  return (
    <Link
      href={href}
      className="ml-auto shrink-0 btn btn-sm"
    >
      {again ? "Add another edition" : "Add"}
    </Link>
  );
}


function LocalEditionResult({ found }: { found: LocalEdition }) {
  const { work } = found;
  const href = work.entryEditionIds.includes(found.editionId)
    ? `/edition/${found.editionId}`
    : `/work/${work.slug}`;

  return (
    <section className="flex items-start gap-4 border-b border-line pb-4">
      <Thumb cover={work.coverUrl ? { kind: "local", url: work.coverUrl } : null} />
      <div className="min-w-0">
        <p>
          <Link href={href} className="underline hover:text-ink">
            {work.title}
          </Link>
        </p>
        {work.authors.length > 0 ? <p className="font-narrow">{work.authors.join(", ")}</p> : null}
        <p className="font-narrow text-ink-dim">
          {found.editionName} · on this server
          {work.entryEditionIds.includes(found.editionId) ? " · on your shelf" : ""}
        </p>
      </div>
    </section>
  );
}

function RemoteEditionResult({ found, isbn13 }: { found: IsbnLookup; isbn13: string }) {
  const { edition, work } = found;
  const title = work?.title ?? edition.title ?? "Untitled";
  const cover = edition.coverId ?? work?.coverId ?? null;
  const details = [
    edition.format === "audiobook" ? "Audiobook" : "Book",
    edition.physicalFormat,
    edition.year,
    languageName(edition.language),
    edition.pages ? `${edition.pages} pages` : null,
  ].filter((part) => part !== null && part !== "");

  return (
    <section className="flex items-start gap-4 border-b border-line pb-4">
      <Thumb cover={cover ? { kind: "openlibrary", id: cover } : null} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p>
          {title}
          {work?.firstPublishedYear ? (
            <span className="ml-2 text-ink-dim">{work.firstPublishedYear}</span>
          ) : null}
        </p>
        {work && work.authors.length > 0 ? (
          <p className="font-narrow">{work.authors.join(", ")}</p>
        ) : null}
        {/* The edition's own title only when it differs: a translation or a
            retitled printing is worth naming, a repeat of the work's is not. */}
        {edition.title && edition.title !== title ? (
          <p className="font-narrow">{edition.title}</p>
        ) : null}
        <p className="font-narrow text-ink-dim">{details.join(" · ")}</p>
        <p className="font-narrow text-ink-dim">
          Open Library ·{" "}
          <span className="font-mono">{isbn13}</span> ·{" "}
          <span className="font-mono">{edition.olEditionKey}</span>
        </p>
        {!work ? (
          <p className="font-narrow text-ink-dim">
            Open Library does not link this edition to a work, so it cannot be added from here.
          </p>
        ) : null}
      </div>
      {work ? (
        <AddLink
          href={`/add/book/${work.olWorkKey}?edition=${edition.olEditionKey}&isbn=${isbn13}`}
          again={false}
        />
      ) : null}
    </section>
  );
}
