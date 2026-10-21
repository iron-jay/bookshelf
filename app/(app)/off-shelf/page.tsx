import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { offShelfBooks, type OffShelfBook } from "@/lib/books/off-shelf";
import { SHELF_LABELS, SHELVES } from "@/lib/shelves";

import { Cover } from "../cover";
import { shelveBook } from "./actions";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Books here that are on none of your shelves, so nothing on the shelf leads
 * to them (Jay, 2026-10-21, with gameshelf). Its own page, linked from
 * Settings, as /art is: a list to work through, each put on a shelf, given an
 * edition, or deleted.
 */
export const metadata: Metadata = { title: "Not on your shelf" };

export default async function OffShelfPage() {
  const user = await requireUser();
  const books = await offShelfBooks(user.id);

  const noEdition = books.filter((book) => book.editionCount === 0);
  const rest = books.filter((book) => book.editionCount > 0);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href="/settings" className="underline">
          Settings
        </Link>
      </p>
      <h1 className="mb-2 font-display text-3xl">Not on your shelf</h1>
      <p className="mb-8 max-w-2xl font-narrow text-ink-dim">
        Books on this server that are on none of your shelves, so the shelf never shows them —
        mostly ones taken off it. Put one back on a shelf, open it, or delete it.
      </p>

      {books.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Every book here is on your shelf.{" "}
          <Link href="/" className="underline">
            Back to the shelf
          </Link>
          .
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-10">
          <Group
            title="No edition"
            about="A book with nothing to read it in. Add an edition to shelve it."
            books={noEdition}
          />
          <Group title="Off the shelf" about="Taken off the shelf, or never put on it." books={rest} />
        </div>
      )}
    </main>
  );
}

function Group({ title, about, books }: { title: string; about: string; books: OffShelfBook[] }) {
  if (books.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl">{title}</h2>
        <span className="text-ink-dim">{books.length}</span>
      </div>
      <p className="mt-1 font-narrow text-ink-dim">{about}</p>
      <ul className="mt-2 flex flex-col">
        {books.map((book) => (
          <Row key={book.workId} book={book} />
        ))}
      </ul>
    </section>
  );
}

function Row({ book }: { book: OffShelfBook }) {
  const href = book.editionId ? `/edition/${book.editionId}` : `/work/${book.slug}`;
  const author = book.authors.join(", ") || null;
  const notes = [
    author,
    book.year,
    book.editionName,
    book.editionCount > 1 ? `${book.editionCount} editions` : null,
  ];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
      <Link href={href} className="block w-12 shrink-0">
        <span className="sr-only">{book.title}</span>
        <Cover title={book.title} author={author} coverUrl={book.coverUrl} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="line-clamp-2 font-serif font-semibold hover:underline">
          {book.title}
        </Link>
        <p className="font-narrow text-ink-dim">{notes.filter(Boolean).join(" · ")}</p>
        {book.seriesName && book.seriesSlug ? (
          <p className="font-narrow text-ink-dim">
            <Link href={`/series/${book.seriesSlug}`} className="underline hover:text-ink">
              {book.seriesName}
            </Link>
            {book.seriesPosition ? ` #${book.seriesPosition}` : ""}
          </p>
        ) : null}
        <p className="mt-1 flex gap-4 font-narrow">
          {book.editionCount === 0 ? (
            <Link href={`/add?work=${book.workId}`} className="underline underline-offset-4">
              Add an edition
            </Link>
          ) : null}
          {book.editionCount > 1 ? (
            <Link href={`/work/${book.slug}`} className="underline underline-offset-4">
              Choose an edition
            </Link>
          ) : null}
          <Link
            href={`/work/${book.slug}/delete?from=off-shelf`}
            className="text-ink-dim underline underline-offset-4 hover:text-danger"
          >
            Delete
          </Link>
        </p>
      </div>
      {book.editionId ? (
        <form
          action={shelveBook}
          aria-label={`Shelf for ${book.title}`}
          className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:px-0"
        >
          <input type="hidden" name="workId" value={book.workId} />
          <div className="segmented text-[13px]">
            {SHELVES.map((shelf) => (
              <button key={shelf} type="submit" name="shelf" value={shelf}>
                {SHELF_LABELS[shelf]}
              </button>
            ))}
          </div>
        </form>
      ) : null}
    </li>
  );
}
