import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { countRunIfMissing } from "@/lib/books/runs";
import { today } from "@/lib/books/shelving";
import { db } from "@/lib/db";
import { collections, editions, entries, series, works } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";

import { CollectionForm } from "../../collection-form";
import { Cover } from "../../cover";
import { takeOutOfSeriesAction } from "./actions";
import { RenameForm } from "./rename-form";
import { SeriesReadForm } from "./series-read-form";

export const dynamic = "force-dynamic";

/**
 * An ordered list of works with your shelf state beside each. That is the
 * whole feature (§2): no progress bars, no completion percentage. Renaming,
 * removing and taking a book out live here too (Jay, 2026-10-20).
 */
export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [first] = await db
    .select()
    .from(series)
    .where(eq(series.slug, decodeURIComponent(slug)));
  if (!first) notFound();

  // A comic run added before issue counts were kept learns its count here,
  // once, so it can fold on the shelf when read to the end.
  let found = first;
  if (found.issueCount === null) {
    await countRunIfMissing(found.id);
    [found] = await db.select().from(series).where(eq(series.id, first.id));
  }

  // Unnumbered works go last rather than first: a series page reads in order,
  // and "somewhere in it" is the least ordered thing there is.
  const members = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      authors: works.authors,
      position: works.seriesPosition,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.seriesId, found.id))
    .orderBy(sql`${works.seriesPosition} asc nulls last`, asc(works.title));

  const mine = members.length
    ? await db
        .select({
          workId: editions.workId,
          editionId: editions.id,
          editionName: editions.name,
          status: entries.status,
        })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(
          and(
            eq(entries.userId, user.id),
            inArray(
              editions.workId,
              members.map((m) => m.id),
            ),
          ),
        )
    : [];

  const finished = new Set(mine.filter((m) => m.status === "finished").map((m) => m.workId)).size;

  const [inCollection] = found.collectionId
    ? await db
        .select({ name: collections.name, slug: collections.slug })
        .from(collections)
        .where(eq(collections.id, found.collectionId))
    : [];
  const collectionNames = (
    await db.select({ name: collections.name }).from(collections).orderBy(asc(collections.name))
  ).map((c) => c.name);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      {inCollection ? (
        <p className="font-narrow">
          <Link href={`/collection/${inCollection.slug}`} className="text-ink-dim underline hover:text-ink">
            {inCollection.name}
          </Link>
        </p>
      ) : null}
      <h1 className="font-display text-3xl">{found.name}</h1>
      <p className="mb-4 font-narrow text-ink-dim">
        {found.issueCount && found.issueCount > 1
          ? `${members.length} of ${found.issueCount} issues here`
          : `${members.length} ${members.length === 1 ? "book" : "books"}`}
        {finished > 0 ? ` · ${finished} finished` : ""}
      </p>
      <div className="mb-6">
        <RenameForm seriesId={found.id} slug={found.slug} name={found.name} />
      </div>
      {members.length - finished > 0 ? (
        <div className="mb-4">
          <SeriesReadForm seriesId={found.id} today={today()} left={members.length - finished} />
        </div>
      ) : null}
      <div className="mb-6">
        <CollectionForm
          targetKind="series"
          targetId={found.id}
          current={inCollection?.name ?? null}
          names={collectionNames}
          note="for every book in this series"
        />
      </div>

      {members.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing is in this series now. A work joins it from its own page.
        </p>
      ) : (
        <ol className="flex max-w-3xl flex-col">
          {members.map((work) => {
            const entriesHere = mine.filter((m) => m.workId === work.id);
            return (
              <li key={work.id} className="flex items-center gap-4 border-b border-line py-2">
                <span className="w-10 shrink-0 text-right font-narrow text-ink-dim">
                  {work.position !== null ? `#${work.position}` : "–"}
                </span>
                <div className="w-12 shrink-0">
                  <Cover
                    title={work.title}
                    author={work.authors.join(", ") || null}
                    coverUrl={work.coverUrl}
                  />
                </div>
                <div className="min-w-0 flex-1">
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
                <form action={takeOutOfSeriesAction} className="shrink-0">
                  <input type="hidden" name="seriesId" value={found.id} />
                  <input type="hidden" name="workId" value={work.id} />
                  <button
                    type="submit"
                    className="py-2 font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                  >
                    Take out<span className="sr-only"> {work.title}</span>
                  </button>
                </form>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
