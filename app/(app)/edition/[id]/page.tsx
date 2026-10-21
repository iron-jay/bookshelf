import { and, asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, entryTags, reads, series, tags, works } from "@/lib/db/schema";
import { SHELF_LABELS, SHELVES } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";
import { languageName } from "@/lib/languages";

import { Cover } from "../../cover";
import { BackToShelf, ChangeCoverLink, SideLink } from "../../cover-page";
import { addTag, addToShelf, readAgainAction, removeTag, setFormat, setRating, setShelf } from "./actions";
import { ReadRow, RemoveFromShelf, ReviewForm } from "./entry-forms";
import { SeriesForm } from "../../work/[slug]/series-form";
import type { Metadata } from "next";
import { editionTitle } from "../../page-titles";

export const dynamic = "force-dynamic";

const KIND_LABELS: Readonly<Record<string, string | null>> = {
  original: null,
  translation: "Official translation",
  revised: "Revised text",
  abridged: "Abridged",
  annotated: "Annotated",
  other: null,
};


function lengthLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : null, m ? `${m} min` : null].filter(Boolean).join(" ");
}

/** The label the credit gets depends on what the edition is (schema comment). */
function creditLabel(kind: string, format: string): string {
  if (kind === "translation") return "Translated by";
  return format === "audiobook" ? "Read by" : "Credit";
}


/**
 * What you actually read: your shelf, rating out of ten, review and reads for
 * this edition, and the few facts about it worth knowing.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return editionTitle((await params).id);
}

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ edition: editions, work: works })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, id));
  if (!row) notFound();
  const { edition, work } = row;

  const [entry] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, user.id), eq(entries.editionId, edition.id)));

  // Oldest first, so the list reads as a history; undated reads sort by when
  // they were recorded.
  const readRows = entry
    ? await db
        .select()
        .from(reads)
        .where(eq(reads.entryId, entry.id))
        .orderBy(sql`coalesce(${reads.finishedOn}, ${reads.startedOn}) asc nulls first`, asc(reads.createdAt))
    : [];

  const entryTagRows = entry
    ? await db
        .select({ id: tags.id, name: tags.name, slug: tags.slug })
        .from(entryTags)
        .innerJoin(tags, eq(tags.id, entryTags.tagId))
        .where(eq(entryTags.entryId, entry.id))
        .orderBy(asc(tags.name))
    : [];
  const allTags = entry
    ? await db.select({ name: tags.name }).from(tags).where(eq(tags.userId, user.id)).orderBy(asc(tags.name))
    : [];

  const [base] = edition.baseEditionId
    ? await db
        .select({ id: editions.id, name: editions.name })
        .from(editions)
        .where(eq(editions.id, edition.baseEditionId))
    : [];

  const [inSeries] = work.seriesId
    ? await db.select({ name: series.name, slug: series.slug }).from(series).where(eq(series.id, work.seriesId))
    : [];
  const seriesNames = (await db.select({ name: series.name }).from(series).orderBy(asc(series.name))).map(
    (s) => s.name,
  );

  const author = work.authors.join(", ") || null;
  const facts: [string, React.ReactNode][] = (
    [
      ["Kind", KIND_LABELS[edition.kind]],
      [creditLabel(edition.kind, edition.format), edition.credit],
      ["Translated from", base ? <Link href={`/edition/${base.id}`} className="underline hover:text-ink">{base.name}</Link> : null],
      ["Language", languageName(edition.language)],
      ["Published", edition.publishedOn],
      ["Pages", edition.pages],
      ["Length", lengthLabel(edition.durationMinutes)],
      ["ISBN", edition.isbn13 ? <span className="font-mono">{edition.isbn13}</span> : null],
      ["Open Library", edition.olEditionKey ? <span className="font-mono">{edition.olEditionKey}</span> : null],
      // For books no catalogue has: the Goodreads page the import came from is
      // one click away, to copy its cover address into "paste an address".
      // Opened in the person's own browser — nothing here fetches Goodreads.
      [
        "Goodreads",
        edition.goodreadsBookId ? (
          <a
            href={`https://www.goodreads.com/book/show/${edition.goodreadsBookId}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink"
          >
            View on Goodreads
          </a>
        ) : null,
      ],
      ["Link", edition.url ? <a href={edition.url} rel="noreferrer" className="break-all underline hover:text-ink">{edition.url}</a> : null],
    ] as [string, React.ReactNode][]
  ).filter(([, value]) => value !== null && value !== undefined && value !== "");

  const coverUrl = edition.coverUrl ?? work.coverUrl;

  return (
    <main className="flex-1 pb-14">
      <section className="bg-band px-4 pt-2 sm:px-10">
        <BackToShelf />
        <div className="flex items-end gap-4 sm:gap-8">
          {/* The whole cover, standing on the plank below. */}
          <div className="relative w-28 shrink-0 sm:w-44">
            <Cover title={work.title} author={author} coverUrl={coverUrl} />
            {entry?.rating ? <span className="sticker">{entry.rating}</span> : null}
          </div>
          <div className="min-w-0 pb-4">
            <h1 className="font-serif text-[28px] leading-[1.05] font-semibold break-words sm:text-5xl">
              {work.title}
            </h1>
            {author ? <p className="mt-2 text-lg [font-stretch:110%]">{author}</p> : null}
            <p className="mt-1 font-narrow text-ink-dim">
              <Link href={`/work/${work.slug}`} className="underline underline-offset-4 hover:text-ink">
                {edition.name}
              </Link>
            </p>
            {inSeries ? (
              <p className="mt-1 font-narrow text-ink-dim">
                <Link href={`/series/${inSeries.slug}`} className="underline underline-offset-4 hover:text-ink">
                  {inSeries.name}
                  {work.seriesPosition !== null ? ` #${work.seriesPosition}` : ""}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>
      <div className="plank" />

      <div className="flex max-w-3xl flex-col gap-8 px-4 pt-4 sm:px-10">
        {/* Under the cover, as they always were (§5). */}
        <div className="flex flex-wrap gap-2">
          <ChangeCoverLink href={`/edition/${edition.id}/cover`} needsReview={edition.coverNeedsReview} />
          {/* Off the shelf, only the work's details are yours to edit. */}
          <SideLink href={entry ? `/edition/${edition.id}/edit` : `/work/${work.slug}/edit`}>Edit details</SideLink>
        </div>

        {!entry ? (
          <form action={addToShelf} className="flex flex-col gap-2">
            <input type="hidden" name="editionId" value={edition.id} />
            <span className="font-narrow text-ink-dim">Not on your shelf. Put it on:</span>
            <div className="segmented text-[14px] sm:text-base">
              {SHELVES.map((shelf) => (
                <button key={shelf} type="submit" name="shelf" value={shelf}>
                  {SHELF_LABELS[shelf]}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <>
            <form action={setShelf} aria-label="Shelf">
              <input type="hidden" name="editionId" value={edition.id} />
              <div className="segmented text-[14px] sm:text-base">
                {SHELVES.map((shelf) => (
                  <button
                    key={shelf}
                    type="submit"
                    name="shelf"
                    value={shelf}
                    aria-pressed={entry.status === shelf}
                  >
                    {SHELF_LABELS[shelf]}
                  </button>
                ))}
              </div>
            </form>

            {/* Ten whole numbers and nothing else (§5): no stars, no halves.
                Ten bars climbing left to right, filled up to the rating; the
                chosen one clears it again. */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl">Rating</h2>
                <span className="font-mono text-sm text-accent">
                  {entry.rating ? `${entry.rating} / 10` : "Unrated"}
                </span>
              </div>
              <form action={setRating} className="flex items-end gap-1">
                <input type="hidden" name="editionId" value={edition.id} />
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="submit"
                    name="rating"
                    value={entry.rating === n ? "" : String(n)}
                    aria-pressed={entry.rating === n}
                    aria-label={entry.rating === n ? `Clear rating of ${n}` : `Rate ${n} out of 10`}
                    title={`${n} / 10`}
                    className={`flex-1 hover:brightness-125 ${
                      entry.rating && n <= entry.rating ? "bg-accent" : "bg-line"
                    }`}
                    style={{ height: `${18 + n * 4}px` }}
                  />
                ))}
              </form>
            </div>

            <div>
              <h2 className="mb-2 font-display text-xl">Reads</h2>
              {readRows.length === 0 ? (
                <p className="mb-2 font-narrow text-ink-dim">
                  No reads yet. Moving it to Reading or Finished records one.
                </p>
              ) : (
                <ul className="mb-3 flex flex-col">
                  {readRows.map((read) => (
                    <ReadRow
                      key={read.id}
                      readId={read.id}
                      startedOn={read.startedOn}
                      finishedOn={read.finishedOn}
                    />
                  ))}
                </ul>
              )}
              <form action={readAgainAction}>
                <input type="hidden" name="editionId" value={edition.id} />
                <button type="submit" className="btn btn-sm">
                  {readRows.length ? "Read again" : "Start reading"}
                </button>
              </form>
            </div>

            <ReviewForm editionId={edition.id} review={entry.review} />

            {/* Free-form buckets beside the four shelves (§2). */}
            <div>
              <h2 className="mb-2 font-display text-xl">Tags</h2>
              <div className="flex flex-wrap items-center gap-2 font-narrow">
                {entryTagRows.map((tag) => (
                  <form key={tag.id} action={removeTag} className="flex items-center rounded-full border border-line-strong">
                    <input type="hidden" name="editionId" value={edition.id} />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <Link href={`/?tag=${encodeURIComponent(tag.slug)}`} className="py-1.5 pr-1 pl-3.5 hover:underline">
                      {tag.name}
                    </Link>
                    <button
                      type="submit"
                      aria-label={`Remove tag ${tag.name}`}
                      className="py-1.5 pr-3.5 pl-1.5 text-ink-dim hover:text-ink"
                    >
                      ×
                    </button>
                  </form>
                ))}
                <form action={addTag} className="flex items-center gap-2">
                  <input type="hidden" name="editionId" value={edition.id} />
                  <input
                    name="tag"
                    list="tag-names"
                    maxLength={60}
                    placeholder="Add a tag"
                    aria-label="Add a tag"
                    className="field w-44 rounded-full px-4"
                  />
                  <datalist id="tag-names">
                    {allTags.map((tag) => (
                      <option key={tag.name} value={tag.name} />
                    ))}
                  </datalist>
                  <button type="submit" className="btn btn-sm">
                    Add
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Here as well as on the book page: a cover opens this page, and the
            book page is a link away from it (Jay, 2026-10-20). */}
        <SeriesForm
          workId={work.id}
          current={inSeries?.name ?? null}
          position={work.seriesPosition}
          seriesNames={seriesNames}
        />

        <div>
          <h2 className="mb-2 font-display text-xl">This edition</h2>
          <form action={setFormat} className="mb-4">
            <input type="hidden" name="editionId" value={edition.id} />
            <div className="segmented inline-flex">
              {(["book", "audiobook"] as const).map((format) => (
                <button
                  key={format}
                  type="submit"
                  name="format"
                  value={format}
                  disabled={!entry}
                  aria-pressed={edition.format === format}
                >
                  {format === "book" ? "Book" : "Audiobook"}
                </button>
              ))}
            </div>
          </form>

          {facts.length > 0 ? (
            <dl className="grid w-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-narrow">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-ink-dim">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {entry ? <RemoveFromShelf editionId={edition.id} /> : null}
          {/* Removing from the shelf keeps the book; this deletes it, behind
              its own confirmation page, as gameshelf does. */}
          <Link
            href={`/edition/${edition.id}/delete`}
            className="font-narrow text-ink-dim underline underline-offset-4 hover:text-danger"
          >
            Delete
          </Link>
        </div>
      </div>
    </main>
  );
}
