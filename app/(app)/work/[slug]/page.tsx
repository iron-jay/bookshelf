import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { collections, editions, entries, series, works } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";
import { languageName } from "@/lib/languages";

import { Cover } from "../../cover";
import { BackToShelf, ChangeCoverLink, SideLink } from "../../cover-page";
import { ratingLabel } from "../../shelf-card";
import { CollectionForm } from "../../collection-form";
import { SeriesForm } from "./series-form";

export const dynamic = "force-dynamic";

const KIND_LABELS: Readonly<Record<string, string | null>> = {
  original: null,
  translation: "Official translation",
  revised: "Revised text",
  abridged: "Abridged",
  annotated: "Annotated",
  other: null,
};


/**
 * The work: its cover, summary and every edition on this server, with your
 * shelf state beside each, and where it sits in a series. "Add edition" is
 * Door B of the add flow.
 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select()
    .from(works)
    .where(eq(works.slug, decodeURIComponent(slug)));
  if (!work) notFound();

  const rows = await db
    .select({
      id: editions.id,
      name: editions.name,
      kind: editions.kind,
      format: editions.format,
      credit: editions.credit,
      language: editions.language,
      coverUrl: editions.coverUrl,
      url: editions.url,
      entryId: entries.id,
      status: entries.status,
      rating: entries.rating,
    })
    .from(editions)
    .leftJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
    .where(eq(editions.workId, work.id))
    .orderBy(asc(editions.createdAt));

  const author = work.authors.join(", ") || null;
  // Comic Vine's page for a comic, as its API gave it, kept on the edition.
  const comicVinePage = work.comicvineIssueId
    ? (rows.find((r) => r.url?.startsWith("https://comicvine.gamespot.com/"))?.url ?? null)
    : null;

  const [inSeries] = work.seriesId
    ? await db
        .select({ id: series.id, name: series.name, slug: series.slug, collectionId: series.collectionId })
        .from(series)
        .where(eq(series.id, work.seriesId))
    : [];
  const seriesNames = (
    await db.select({ name: series.name }).from(series).orderBy(asc(series.name))
  ).map((s) => s.name);

  // In a series, the series carries the collection for all its books; only a
  // book on its own has one of its own.
  const collectionId = inSeries ? inSeries.collectionId : work.collectionId;
  const [inCollection] = collectionId
    ? await db
        .select({ name: collections.name, slug: collections.slug })
        .from(collections)
        .where(eq(collections.id, collectionId))
    : [];
  const collectionNames = (
    await db.select({ name: collections.name }).from(collections).orderBy(asc(collections.name))
  ).map((c) => c.name);

  return (
    <main className="flex-1 pb-14">
      <section className="bg-band px-4 pt-2 sm:px-10">
        <BackToShelf />
        <div className="flex items-end gap-4 sm:gap-8">
          {/* The whole cover, standing on the plank below. */}
          <div className="w-28 shrink-0 sm:w-44">
            <Cover title={work.title} author={author} coverUrl={work.coverUrl} />
          </div>
          <div className="min-w-0 pb-4">
            <h1 className="font-serif text-[28px] leading-[1.05] font-semibold break-words sm:text-5xl">
              {work.title}
            </h1>
            {work.subtitle ? <p className="mt-1 text-ink-dim">{work.subtitle}</p> : null}
            {author ? <p className="mt-2 text-lg [font-stretch:110%]">{author}</p> : null}
          </div>
        </div>
      </section>
      <div className="plank" />

      <div className="flex max-w-4xl flex-col gap-8 px-4 pt-4 sm:px-10">
        <div className="flex flex-wrap gap-2">
          <ChangeCoverLink href={`/work/${work.slug}/cover`} needsReview={work.coverNeedsReview} />
          <SideLink href={`/work/${work.slug}/edit`}>Edit details</SideLink>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="font-narrow">
            {inCollection ? (
              <p>
                <Link href={`/collection/${inCollection.slug}`} className="underline hover:text-ink">
                  {inCollection.name}
                </Link>
              </p>
            ) : null}
            {inSeries ? (
              <p>
                <Link href={`/series/${inSeries.slug}`} className="underline hover:text-ink">
                  {inSeries.name}
                </Link>
                {work.seriesPosition !== null ? ` #${work.seriesPosition}` : null}
              </p>
            ) : null}
            <p className="font-narrow text-ink-dim">
              {[
                work.firstPublishedYear,
                work.source === "openlibrary"
                  ? "Open Library"
                  : work.source === "local"
                    ? work.hardcoverId
                      ? "Hardcover"
                      : "Added by hand"
                    : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {/* Comic Vine asks for a link back wherever its data is shown. */}
              {comicVinePage ? (
                <>
                  {work.firstPublishedYear ? " · " : ""}
                  <a
                    href={comicVinePage}
                    rel="noreferrer"
                    className="underline hover:text-ink"
                  >
                    Comic Vine
                  </a>
                </>
              ) : null}
              {work.olWorkKey ? (
                <>
                  {" · "}
                  <span className="font-mono">{work.olWorkKey}</span>
                </>
              ) : null}
            </p>
          </div>

          <SeriesForm
            workId={work.id}
            current={inSeries?.name ?? null}
            position={work.seriesPosition}
            seriesNames={seriesNames}
          />

          <CollectionForm
            targetKind={inSeries ? "series" : "work"}
            targetId={inSeries ? inSeries.id : work.id}
            current={inCollection?.name ?? null}
            names={collectionNames}
            note={inSeries ? `for every book in ${inSeries.name}` : null}
          />

          {/* Long-form prose, so Newsreader (§5b). */}
          {work.summary ? (
            <p className="max-w-prose font-serif text-lg leading-relaxed whitespace-pre-line">
              {work.summary}
            </p>
          ) : null}
        </div>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-4">
          <h2 className="font-display text-xl">Editions</h2>
          <Link
            href={`/add?work=${work.id}`}
            className="btn btn-sm"
          >
            Add edition
          </Link>
          {work.olWorkKey ? (
            <Link
              href={`/add/book/${work.olWorkKey}`}
              className="font-narrow text-ink-dim underline hover:text-ink"
            >
              Add one of Open Library’s
            </Link>
          ) : null}
        </div>

        <ul className="flex flex-col">
          {rows.map((edition) => {
            const details = [
              KIND_LABELS[edition.kind],
              edition.format === "audiobook" ? "Audiobook" : null,
              languageName(edition.language),
              edition.credit,
            ].filter(Boolean);
            return (
              <li key={edition.id} className="flex items-center gap-4 border-b border-line py-3">
                <div className="w-12 shrink-0">
                  <Cover
                    title={work.title}
                    author={author}
                    coverUrl={edition.coverUrl ?? work.coverUrl}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {edition.entryId ? (
                      <Link href={`/edition/${edition.id}`} className="underline hover:text-ink">
                        {edition.name}
                      </Link>
                    ) : (
                      edition.name
                    )}
                  </p>
                  {details.length > 0 ? (
                    <p className="truncate font-narrow text-ink-dim">{details.join(" · ")}</p>
                  ) : null}
                  <p className="font-narrow text-ink-dim">
                    {edition.status
                      ? `${SHELF_LABELS[edition.status]} · ${ratingLabel(edition.rating)}`
                      : "Not on your shelf"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p>
        <Link
          href={`/work/${work.slug}/delete`}
          className="font-narrow text-ink-dim underline underline-offset-4 hover:text-danger"
        >
          Delete
        </Link>
      </p>
      </div>
    </main>
  );
}
