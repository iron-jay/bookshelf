import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { collections, series, works } from "@/lib/db/schema";

import { seriesTitle } from "../../../page-titles";
import { removeSeriesAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return seriesTitle((await params).slug, "Remove");
}

/** Its own page, as deleting a book is: one tap on the series page should not undo a series. */
export default async function RemoveSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [found] = await db
    .select({ id: series.id, name: series.name, volumeId: series.comicvineVolumeId, collection: collections.name })
    .from(series)
    .leftJoin(collections, eq(collections.id, series.collectionId))
    .where(eq(series.slug, decodeURIComponent(slug)));
  if (!found) notFound();

  const [books] = await db.select({ n: count() }).from(works).where(eq(works.seriesId, found.id));
  const n = books?.n ?? 0;

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/series/${slug}`} className="underline">
          {found.name}
        </Link>
      </p>
      <h1 className="mb-4 font-display text-3xl">Remove the series {found.name}?</h1>
      <div className="flex max-w-xl flex-col gap-2">
        <p>
          {n === 1 ? "Its book stays" : `Its ${n} books stay`} on your shelf with your ratings, reviews and
          reads, without a series or a number. Only the series goes.
        </p>
        {found.collection ? (
          <p className="font-narrow text-ink-dim">They stay in {found.collection}.</p>
        ) : null}
        {found.volumeId !== null ? (
          <p className="font-narrow text-ink-dim">
            A finished run stops showing as one tile. Adding one of its issues from Comic Vine again starts the
            series again.
          </p>
        ) : null}
      </div>

      <form action={removeSeriesAction} className="mt-6 flex items-center gap-4">
        <input type="hidden" name="seriesId" value={found.id} />
        <button type="submit" className="btn btn-danger">
          Remove the series
        </button>
        <Link href={`/series/${slug}`} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </form>
    </main>
  );
}
