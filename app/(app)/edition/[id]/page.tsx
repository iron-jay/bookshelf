import { and, asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, entries, entryTags, reads, tags, works } from "@/lib/db/schema";
import { SHELF_LABELS, SHELVES } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

import { Cover } from "../../cover";
import { addTag, addToShelf, readAgainAction, removeTag, setFormat, setRating, setShelf } from "./actions";
import { ReadRow, RemoveFromShelf, ReviewForm } from "./entry-forms";

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

function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames("en", { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function lengthLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : null, m ? `${m} min` : null].filter(Boolean).join(" ");
}

/** The label the credit gets depends on what the edition is (schema comment). */
function creditLabel(kind: string, format: string): string {
  if (kind === "translation" || kind === "fan_translation") return "Translated by";
  return format === "audiobook" ? "Read by" : "Credit";
}

/** Selected by weight and a hairline, never colour: --label means one thing. */
function choiceClass(selected: boolean): string {
  return `-ml-px border px-3 py-1.5 font-narrow first:ml-0 ${
    selected ? "relative border-ink text-ink" : "border-line text-ink-dim hover:text-ink"
  }`;
}

/**
 * What you actually read: your shelf, rating out of ten, review and reads for
 * this edition, and the few facts about it worth knowing.
 */
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

  const community = (COMMUNITY_EDITION_KINDS as readonly string[]).includes(edition.kind);
  const author = work.authors.join(", ") || null;
  const facts: [string, React.ReactNode][] = (
    [
      ["Kind", KIND_LABELS[edition.kind]],
      [creditLabel(edition.kind, edition.format), edition.credit],
      ["Translated from", base ? <Link href={`/edition/${base.id}`} className="underline hover:text-ink">{base.name}</Link> : null],
      ["Language", languageName(edition.language)],
      ["Publisher", edition.publisher],
      ["Published", edition.publishedOn],
      ["Pages", edition.pages],
      ["Length", lengthLabel(edition.durationMinutes)],
      ["ISBN", edition.isbn13 ? <span className="font-mono">{edition.isbn13}</span> : null],
      ["Open Library", edition.olEditionKey ? <span className="font-mono">{edition.olEditionKey}</span> : null],
      ["Link", edition.url ? <a href={edition.url} rel="noreferrer" className="break-all underline hover:text-ink">{edition.url}</a> : null],
    ] as [string, React.ReactNode][]
  ).filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <main className="flex-1 p-6">
      <div className="flex max-w-4xl flex-col gap-8 sm:flex-row">
        <div className="w-40 shrink-0">
          <Cover
            title={work.title}
            author={author}
            // The entry_cards rule: a fan translation shows its own art or none.
            coverUrl={edition.coverUrl ?? (community ? null : work.coverUrl)}
            band={community ? { name: edition.name, credit: edition.credit } : null}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h1 className="text-2xl font-medium">{community ? edition.name : work.title}</h1>
            <p>
              <Link href={`/work/${work.slug}`} className="underline hover:text-ink">
                {community ? work.title : edition.name}
              </Link>
              {author ? <span className="text-ink-dim"> · {author}</span> : null}
            </p>
          </div>

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

          <form action={setFormat} className="flex items-center gap-3">
            <input type="hidden" name="editionId" value={edition.id} />
            <div className="flex">
              {(["book", "audiobook"] as const).map((format) => (
                <button
                  key={format}
                  type="submit"
                  name="format"
                  value={format}
                  disabled={!entry}
                  aria-pressed={edition.format === format}
                  className={choiceClass(edition.format === format)}
                >
                  {format === "book" ? "Book" : "Audiobook"}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      <section className="mt-10 flex max-w-4xl flex-col gap-8">
        {!entry ? (
          <form action={addToShelf} className="flex flex-wrap items-center gap-3 font-narrow">
            <input type="hidden" name="editionId" value={edition.id} />
            <span className="text-ink-dim">Not on your shelf.</span>
            {SHELVES.map((shelf) => (
              <button key={shelf} type="submit" name="shelf" value={shelf} className={choiceClass(false)}>
                {SHELF_LABELS[shelf]}
              </button>
            ))}
          </form>
        ) : (
          <>
            <form action={setShelf} className="flex flex-col gap-1.5">
              <input type="hidden" name="editionId" value={edition.id} />
              <span className="font-narrow text-ink-dim">Shelf</span>
              <div className="flex flex-wrap">
                {SHELVES.map((shelf) => (
                  <button
                    key={shelf}
                    type="submit"
                    name="shelf"
                    value={shelf}
                    aria-pressed={entry.status === shelf}
                    className={choiceClass(entry.status === shelf)}
                  >
                    {SHELF_LABELS[shelf]}
                  </button>
                ))}
              </div>
            </form>

            {/* Ten whole numbers and nothing else (§5): no stars, no halves.
                The chosen one clears it again. */}
            <form action={setRating} className="flex flex-col gap-1.5">
              <input type="hidden" name="editionId" value={edition.id} />
              <span className="font-narrow text-ink-dim">
                Rating{entry.rating ? ` · ${entry.rating}/10` : " · Unrated"}
              </span>
              <div className="flex flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="submit"
                    name="rating"
                    value={entry.rating === n ? "" : String(n)}
                    aria-pressed={entry.rating === n}
                    aria-label={entry.rating === n ? `Clear rating of ${n}` : `Rate ${n} out of 10`}
                    className={`${choiceClass(entry.rating === n)} min-w-10`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </form>

            {/* Free-form buckets beside the four shelves (§2). Plain text, not
                chips in a colour: --label means fan translation. */}
            <div className="flex flex-col gap-1.5 font-narrow">
              <span className="text-ink-dim">Tags</span>
              <div className="flex flex-wrap items-center gap-2">
                {entryTagRows.map((tag) => (
                  <form key={tag.id} action={removeTag} className="flex items-center border border-line">
                    <input type="hidden" name="editionId" value={edition.id} />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <Link href={`/?tag=${encodeURIComponent(tag.slug)}`} className="px-2 py-1 hover:text-ink">
                      {tag.name}
                    </Link>
                    <button
                      type="submit"
                      aria-label={`Remove tag ${tag.name}`}
                      className="border-l border-line px-2 py-1 text-ink-dim hover:text-ink"
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
                    className="w-40 border border-line bg-ground px-2 py-1 text-ink outline-none focus:border-ink-dim"
                  />
                  <datalist id="tag-names">
                    {allTags.map((tag) => (
                      <option key={tag.name} value={tag.name} />
                    ))}
                  </datalist>
                  <button type="submit" className="text-ink-dim underline hover:text-ink">
                    Add
                  </button>
                </form>
              </div>
            </div>

            <ReviewForm editionId={edition.id} review={entry.review} />

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-4">
                <h2 className="font-medium">Reads</h2>
                <form action={readAgainAction}>
                  <input type="hidden" name="editionId" value={edition.id} />
                  <button type="submit" className="font-narrow text-ink-dim underline hover:text-ink">
                    {readRows.length ? "Read again" : "Start reading"}
                  </button>
                </form>
              </div>
              {readRows.length === 0 ? (
                <p className="font-narrow text-ink-dim">
                  No reads yet. Moving it to Reading or Finished records one.
                </p>
              ) : (
                <ul className="flex flex-col">
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
            </div>

            <RemoveFromShelf editionId={edition.id} />
          </>
        )}
      </section>
    </main>
  );
}
