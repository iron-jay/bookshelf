import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { collections, editions, entries, series, works } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";

import { BackToShelf } from "../../cover-page";
import { Cover } from "../../cover";

export const dynamic = "force-dynamic";

type Member = {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  position: number | null;
  year: number | null;
  coverUrl: string | null;
  seriesId: string | null;
};

/**
 * A collection: its series, each in reading order, then the books in it on
 * their own. Series come in the order they began — the year of their earliest
 * book — since that is the nearest thing a franchise has to a reading order;
 * books on their own by year too. Your shelf state beside each, as on a series
 * page.
 */
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [found] = await db
    .select()
    .from(collections)
    .where(eq(collections.slug, decodeURIComponent(slug)));
  if (!found) notFound();

  const seriesHere = await db
    .select({ id: series.id, name: series.name, slug: series.slug })
    .from(series)
    .where(eq(series.collectionId, found.id));

  // A work is in the collection through its series, or — with no series —
  // directly. A work in some other series keeps that series' collection.
  const members: Member[] = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      authors: works.authors,
      position: works.seriesPosition,
      year: works.firstPublishedYear,
      coverUrl: works.coverUrl,
      seriesId: works.seriesId,
    })
    .from(works)
    .where(
      or(
        seriesHere.length ? inArray(works.seriesId, seriesHere.map((s) => s.id)) : sql`false`,
        and(isNull(works.seriesId), eq(works.collectionId, found.id)),
      ),
    )
    .orderBy(sql`${works.seriesPosition} asc nulls last`, sql`${works.firstPublishedYear} asc nulls last`, asc(works.title));

  const mine = members.length
    ? await db
        .select({ workId: editions.workId, editionId: editions.id, editionName: editions.name, status: entries.status })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(and(eq(entries.userId, user.id), inArray(editions.workId, members.map((m) => m.id))))
    : [];

  const began = (seriesId: string) =>
    Math.min(...members.filter((m) => m.seriesId === seriesId).map((m) => m.year ?? Number.POSITIVE_INFINITY));
  const orderedSeries = [...seriesHere].sort((a, b) => began(a.id) - began(b.id) || a.name.localeCompare(b.name));
  const onTheirOwn = members
    .filter((m) => m.seriesId === null)
    .sort((a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title));

  const finished = new Set(mine.filter((m) => m.status === "finished").map((m) => m.workId)).size;

  function rows(list: Member[], numbered: boolean) {
    return (
      <ol className="flex flex-col">
        {list.map((work) => {
          const entriesHere = mine.filter((m) => m.workId === work.id);
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
                            {SHELF_LABELS[e.status]}
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
        {members.length} {members.length === 1 ? "book" : "books"}
        {orderedSeries.length > 0
          ? ` · ${orderedSeries.length} ${orderedSeries.length === 1 ? "series" : "series"}`
          : ""}
        {finished > 0 ? ` · ${finished} finished` : ""}
      </p>

      {members.length === 0 ? (
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
              {rows(
                members.filter((m) => m.seriesId === s.id),
                true,
              )}
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
