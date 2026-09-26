import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, entries, series, works } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";
import { languageName } from "@/lib/languages";

import { Cover } from "../../cover";
import { ChangeCoverLink } from "../../cover-page";
import { ratingLabel } from "../../shelf-card";
import { SeriesForm } from "./series-form";
import { WorkEditForm } from "./work-edit-form";

export const dynamic = "force-dynamic";

const KIND_LABELS: Readonly<Record<string, string | null>> = {
  original: null,
  translation: "Official translation",
  fan_translation: "Fan translation",
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

  const [inSeries] = work.seriesId
    ? await db
        .select({ name: series.name, slug: series.slug })
        .from(series)
        .where(eq(series.id, work.seriesId))
    : [];
  const seriesNames = (
    await db.select({ name: series.name }).from(series).orderBy(asc(series.name))
  ).map((s) => s.name);

  return (
    <main className="flex-1 p-6">
      <div className="flex max-w-4xl flex-col gap-8 sm:flex-row">
        <div className="flex w-40 shrink-0 flex-col gap-3">
          <Cover title={work.title} author={author} coverUrl={work.coverUrl} band={null} />
          <ChangeCoverLink href={`/work/${work.slug}/cover`} needsReview={work.coverNeedsReview} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h1 className="text-2xl font-medium">{work.title}</h1>
            {work.subtitle ? <p className="text-ink-dim">{work.subtitle}</p> : null}
            {author ? <p className="mt-1">{author}</p> : null}
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
                work.source === "local" ? "Added by hand" : "Open Library",
              ]
                .filter(Boolean)
                .join(" · ")}
              {work.olWorkKey ? (
                <>
                  {" · "}
                  <span className="font-mono">{work.olWorkKey}</span>
                </>
              ) : null}
            </p>
          </div>

          <WorkEditForm
            work={{
              id: work.id,
              title: work.title,
              subtitle: work.subtitle,
              authors: work.authors,
              authorSort: work.authorSort,
              firstPublishedYear: work.firstPublishedYear,
              summary: work.summary,
            }}
          />

          <SeriesForm
            workId={work.id}
            current={inSeries?.name ?? null}
            position={work.seriesPosition}
            seriesNames={seriesNames}
          />

          {/* Long-form prose, so Newsreader (§5b). */}
          {work.summary ? (
            <p className="max-w-prose font-serif text-lg leading-relaxed whitespace-pre-line">
              {work.summary}
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-10 max-w-4xl">
        <div className="mb-3 flex flex-wrap items-baseline gap-4">
          <h2 className="font-medium">Editions</h2>
          <Link
            href={`/add?work=${work.id}`}
            className="border border-line px-3 py-1.5 font-narrow hover:border-ink-dim"
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
            const community = (COMMUNITY_EDITION_KINDS as readonly string[]).includes(edition.kind);
            const details = [
              KIND_LABELS[edition.kind],
              edition.format === "audiobook" ? "Audiobook" : null,
              languageName(edition.language),
              edition.credit,
            ].filter(Boolean);
            return (
              <li key={edition.id} className="flex items-center gap-4 border-b border-line py-2">
                <div className="w-12 shrink-0">
                  <Cover
                    title={work.title}
                    author={author}
                    // The same rule entry_cards applies: a community edition
                    // shows its own art or none, never the work's.
                    coverUrl={edition.coverUrl ?? (community ? null : work.coverUrl)}
                    band={community ? { name: "", credit: null } : null}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate">
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
    </main>
  );
}
