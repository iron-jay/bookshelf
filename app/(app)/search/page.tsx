import { and, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { parseIsbn, type Isbn } from "@/lib/isbn";
import { languageName } from "@/lib/languages";
import {
  coverUrl,
  lookupIsbn,
  OpenLibraryError,
  searchWorks,
  type IsbnLookup,
} from "@/lib/openlibrary";

import { mergeResults, type Cover, type LocalWork, type SearchResult } from "./results";

export const dynamic = "force-dynamic";

const LOCAL_LIMIT = 20;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every word has to appear somewhere in the title or the authors, so
 * "pratchett guards" finds Guards! Guards! the way Open Library's own search
 * would, rather than needing the words in order.
 */
async function searchLocal(userId: string, term: string): Promise<LocalWork[]> {
  const words = term.split(/\s+/).filter(Boolean);
  const haystack = sql`(${works.title} || ' ' || array_to_string(${works.authors}, ' '))`;
  const conditions: SQL[] = words.map((w) => ilike(haystack, `%${escapeLike(w)}%`));

  const rows = await db
    .select({
      id: works.id,
      slug: works.slug,
      olWorkKey: works.olWorkKey,
      title: works.title,
      subtitle: works.subtitle,
      authors: works.authors,
      firstPublishedYear: works.firstPublishedYear,
      coverUrl: works.coverUrl,
      source: works.source,
    })
    .from(works)
    .where(and(...conditions))
    .limit(LOCAL_LIMIT);

  return withEntries(userId, rows);
}

async function withEntries(
  userId: string,
  rows: Omit<LocalWork, "entryEditionIds">[],
): Promise<LocalWork[]> {
  if (rows.length === 0) return [];

  const mine = await db
    .select({ workId: editions.workId, editionId: editions.id })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .where(
      and(
        eq(entries.userId, userId),
        inArray(
          editions.workId,
          rows.map((row) => row.id),
        ),
      ),
    );

  return rows.map((row) => ({
    ...row,
    entryEditionIds: mine.filter((m) => m.workId === row.id).map((m) => m.editionId),
  }));
}

type LocalEdition = {
  editionId: string;
  editionName: string;
  work: LocalWork;
};

/**
 * Checked before Open Library is asked, so a book already on this server is
 * found by ISBN with the network down. Both columns are searched because
 * Open Library records sometimes carry only one of the two.
 */
async function findLocalEdition(userId: string, isbn: Isbn): Promise<LocalEdition | null> {
  const matches = [eq(editions.isbn13, isbn.isbn13)];
  if (isbn.isbn10) matches.push(eq(editions.isbn10, isbn.isbn10));

  const [row] = await db
    .select({
      editionId: editions.id,
      editionName: editions.name,
      id: works.id,
      slug: works.slug,
      olWorkKey: works.olWorkKey,
      title: works.title,
      subtitle: works.subtitle,
      authors: works.authors,
      firstPublishedYear: works.firstPublishedYear,
      coverUrl: works.coverUrl,
      source: works.source,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(or(...matches))
    .limit(1);

  if (!row) return null;

  const { editionId, editionName, ...work } = row;
  const [withShelf] = await withEntries(userId, [work]);
  return { editionId, editionName, work: withShelf };
}

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
    let remote: Awaited<ReturnType<typeof searchWorks>> = [];
    try {
      remote = await searchWorks(term);
    } catch (error) {
      notice = remoteFailure(error);
      remoteFailed = true;
    }
    results = mergeResults(term, local, remote);
  }

  return (
    <main className="flex-1 p-6">
      <form className="mb-6 flex gap-2" action="/search">
        <input
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Title, author or ISBN"
          aria-label="Search"
          autoFocus
          className="w-full max-w-md border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-ink-dim"
        />
        <button
          type="submit"
          className="border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim"
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
          </Link>{" "}
          or{" "}
          <Link href="/add?type=fan_translation" className="underline hover:text-ink">
            add a fan translation
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
      ? "Local work"
      : result.provenance === "saved"
        ? "Open Library · saved here"
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
      className="ml-auto shrink-0 border border-line px-3 py-1.5 font-narrow hover:border-ink-dim"
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
    edition.publisher,
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
