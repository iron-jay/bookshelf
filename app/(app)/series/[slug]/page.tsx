import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, series, works } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";

import { Cover } from "../../cover";

export const dynamic = "force-dynamic";

/**
 * An ordered list of works with your shelf state beside each. That is the
 * whole feature (§2): no progress bars, no completion percentage.
 */
export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [found] = await db
    .select()
    .from(series)
    .where(eq(series.slug, decodeURIComponent(slug)));
  if (!found) notFound();

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

  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-medium">{found.name}</h1>
      <p className="mb-6 font-narrow text-ink-dim">
        {members.length} {members.length === 1 ? "book" : "books"}
        {finished > 0 ? ` · ${finished} finished` : ""}
      </p>

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
                    band={null}
                  />
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
      )}
    </main>
  );
}
