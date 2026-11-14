import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { collectionDetail } from "@/lib/books/read";
import { SHELF_LABELS, type Shelf } from "@/lib/shelves";

import { BackToShelf } from "../../cover-page";
import { Cover } from "../../cover";
import type { Metadata } from "next";
import { collectionTitle } from "../../page-titles";

export const dynamic = "force-dynamic";

/**
 * A collection: its series, each in reading order, then the books in it on
 * their own. Series come in the order they began — the year of their earliest
 * book — since that is the nearest thing a franchise has to a reading order;
 * books on their own by year too. Your shelf state beside each, as on a series
 * page.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return collectionTitle((await params).slug);
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const found = await collectionDetail(user.id, decodeURIComponent(slug));
  if (!found) notFound();
  const { series: orderedSeries, works: onTheirOwn, finished } = found;
  const memberCount = found.books;
  type Member = (typeof onTheirOwn)[number];

  function rows(list: Member[], numbered: boolean) {
    return (
      <ol className="flex flex-col">
        {list.map((work) => {
          const entriesHere = work.entries;
          return (
            <li key={work.id} className="flex items-center gap-4 border-b border-line py-2">
              <span className="w-10 shrink-0 text-right font-narrow text-ink-dim">
                {numbered ? (work.position !== null ? `#${work.position}` : "–") : (work.year ?? "–")}
              </span>
              <div className="w-12 shrink-0">
                <Cover title={work.title} author={work.authors.join(", ") || null} coverUrl={work.coverUrl} />
              </div>
              <div className="min-w-0">
                <p className="truncate">
                  <Link href={`/work/${work.slug}`} className="underline hover:text-ink">
                    {work.title}
                  </Link>
                </p>
                <p className="truncate font-narrow text-ink-dim">
                  {entriesHere.length === 0
                    ? "Not on your shelf"
                    : entriesHere.map((e, i) => (
                        <span key={e.editionId}>
                          {i > 0 ? ", " : null}
                          <Link href={`/edition/${e.editionId}`} className="hover:text-ink">
                            {SHELF_LABELS[e.shelf as Shelf]}
                            {entriesHere.length > 1 ? ` (${e.editionName})` : ""}
                          </Link>
                        </span>
                      ))}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <BackToShelf />
      <h1 className="font-display text-3xl">{found.name}</h1>
      <p className="mb-6 font-narrow text-ink-dim">
        {memberCount} {memberCount === 1 ? "book" : "books"}
        {orderedSeries.length > 0
          ? ` · ${orderedSeries.length} ${orderedSeries.length === 1 ? "series" : "series"}`
          : ""}
        {finished > 0 ? ` · ${finished} finished` : ""}
      </p>

      {memberCount === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing is in this collection now. A series joins it from its own page, a book from its work page.
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-8">
          {orderedSeries.map((s) => (
            <section key={s.id}>
              <h2 className="mb-1 font-display text-xl">
                <Link href={`/series/${s.slug}`} className="underline hover:text-ink">
                  {s.name}
                </Link>
              </h2>
              {rows(s.works, true)}
            </section>
          ))}
          {onTheirOwn.length > 0 ? (
            <section>
              <h2 className="mb-1 font-display text-xl">{orderedSeries.length > 0 ? "Not in a series" : "Books"}</h2>
              {rows(onTheirOwn, false)}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
