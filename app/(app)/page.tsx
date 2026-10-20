import { and, count, eq, gte, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import {
  isShelfSort,
  SHELF_SORTS,
  shelfRows,
  tagsWithCounts,
  type ShelfRow,
  type ShelfSort,
} from "@/lib/books/shelf";
import { completeRuns, foldRuns, type FoldedRow, type Run } from "@/lib/books/runs";
import { db } from "@/lib/db";
import { entries, entryCards, reads } from "@/lib/db/schema";
import { isShelf, SHELF_LABELS, SHELVES, type Shelf } from "@/lib/shelves";

import { FilterForm } from "./filter-form";
import { RememberShelfView } from "./remember-shelf-view";
import type { ShelfCard } from "./shelf-card";
import { ReadingNow } from "./reading-now";
import { ResolveOnce } from "./resolve-once";
import { ShelfGrid, Tile, type ShelfSection } from "./shelf-grid";
import { preferencesFrom, SHELF_VIEW_COOKIE } from "./shelf-view";

export const dynamic = "force-dynamic";

const GROUPINGS = {
  none: "No grouping",
  shelf: "Shelf",
  collection: "Collection",
  series: "Series",
  author: "Author",
  finished: "Year finished",
  added: "Year added",
  year: "Year published",
  format: "Book or audiobook",
} as const;
type GroupBy = keyof typeof GROUPINGS;

const VIEWS = { grid: "Grid", list: "List" } as const;
type View = keyof typeof VIEWS;

type Params = {
  status?: string;
  tag?: string;
  sort?: string;
  groupBy?: string;
  view?: string;
  /** "all" for the whole wall; otherwise a bare "/" is the shelves overview. */
  show?: string;
  added?: string;
  already?: string;
};

function isKeyOf<T extends object>(table: T, value: string | undefined): value is Extract<keyof T, string> {
  return value !== undefined && Object.hasOwn(table, value);
}

/** The URL-state part of the params: not the one-off added/already notice. */
function queryFor(params: Params): string {
  const query = new URLSearchParams();
  for (const key of ["status", "tag", "sort", "groupBy", "view", "show"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  return query.toString();
}

function hrefWith(current: Params, patch: Params): string {
  const qs = queryFor({ ...current, ...patch });
  return qs ? `/?${qs}` : "/";
}

const SELECT = "field";

/** The overview's rows, in the order you look for things: next, done, gave up. */
const ROOMS: ReadonlyArray<{ shelf: Shelf; title: string }> = [
  { shelf: "tbr", title: "To read" },
  { shelf: "finished", title: "Recently finished" },
  { shelf: "dnf", title: "Did not finish" },
];
/**
 * The main page is an overview: ten to a strip at most (Jay, 2026-10-20).
 * "See all" is that shelf in full, and "All shelves" in the nav is every one.
 */
const STRIP_LENGTH = 10;

type Row = ShelfRow;

/** The bucket a row belongs in, and how buckets order. Unknowns always last. */
function bucketFor(row: Row, groupBy: GroupBy): { label: string; order: number | string } {
  switch (groupBy) {
    case "shelf": {
      // The four shelves in the order a shelf reads in, not alphabetically.
      const shelf = row.status ?? "tbr";
      return { label: SHELF_LABELS[shelf], order: SHELVES.indexOf(shelf) };
    }
    case "added": {
      // When it joined the shelf — Goodreads' Date Added for an import, which
      // is kept on the entry, so a library imported today still spreads back
      // over the years it was built.
      const year = row.addedAt ? row.addedAt.getFullYear() : null;
      return year ? { label: String(year), order: -year } : { label: "Date unknown", order: Number.MAX_SAFE_INTEGER };
    }
    case "collection":
      return {
        label: row.collectionName ?? "Not in a collection",
        order: row.collectionName?.toLowerCase() ?? "\uffff",
      };
    case "series":
      return {
        label: row.seriesName ?? "Not in a series",
        order: row.seriesName?.toLowerCase() ?? "\uffff",
      };
    case "author": {
      // First credited author: a co-written book groups under whoever the
      // cover leads with, as a bookshop would shelve it.
      const name = row.authors?.[0];
      return { label: name ?? "Author unknown", order: row.authorSort?.toLowerCase() ?? "￿" };
    }
    case "finished": {
      // The year of the latest finish: a reread moves a book to the year it was
      // read again, as the shelf's "last finished" sort does. A book can only
      // sit in one group.
      const year = row.lastFinishedOn ? Number(row.lastFinishedOn.slice(0, 4)) : null;
      if (year) return { label: String(year), order: -year };
      // Not finished leads, above the newest year: what you are reading or
      // mean to read is what the shelf is for. Finished with no date is common
      // after a Goodreads import (Read Count with no Date Read); it is still
      // finished, so it goes after the oldest year.
      return row.status === "finished"
        ? { label: "Finished, date unknown", order: Number.MAX_SAFE_INTEGER }
        : { label: "Not finished", order: Number.MIN_SAFE_INTEGER };
    }
    case "year":
      return {
        label: row.year ? String(row.year) : "Year unknown",
        order: row.year ? -row.year : Number.POSITIVE_INFINITY,
      };
    case "format":
      return row.format === "audiobook"
        ? { label: "Audiobooks", order: 1 }
        : { label: "Books", order: 0 };
    default:
      return { label: "", order: 0 };
  }
}

function toCard({ row, run }: { row: Row; run: Run | null }): ShelfCard {
  const card: ShelfCard = {
    entryId: row.entryId ?? "",
    editionId: row.editionId ?? "",
    workTitle: row.workTitle ?? "Untitled",
    authors: row.authors ?? [],
    editionName: row.editionName ?? "",
    editionCredit: row.editionCredit,
    format: row.format ?? "book",
    status: row.status ?? "tbr",
    rating: row.rating,
    coverUrl: row.coverUrl,
    lastFinishedOn: row.lastFinishedOn,
    run: null,
  };
  if (!run) return card;
  // The run stands under its own name; the rating was each issue's, so none.
  return {
    ...card,
    entryId: `run:${run.seriesId}`,
    workTitle: run.name,
    editionName: `${run.issueCount} issues`,
    rating: null,
    run: { slug: run.slug, issueCount: run.issueCount },
  };
}

/** Finishes this calendar year, rereads included — each is a book finished. */
async function finishedThisYear(userId: string, year: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(reads)
    .innerJoin(entries, eq(entries.id, reads.entryId))
    .where(
      and(
        eq(entries.userId, userId),
        gte(reads.finishedOn, `${year}-01-01`),
        lt(reads.finishedOn, `${year + 1}-01-01`),
      ),
    );
  return row.n;
}

export default async function ShelfPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();

  // A bare "/" is not a reset — it is your own way of looking at the shelf. The
  // URL still wins wherever it says anything, so a shared or bookmarked link
  // shows what it says rather than what the reader happens to prefer.
  const asked = await searchParams;
  const params: Params = {
    ...preferencesFrom((await cookies()).get(SHELF_VIEW_COOKIE)?.value),
    ...asked,
  };

  const status: Shelf | undefined = isShelf(params.status) ? params.status : undefined;
  const sort: ShelfSort = isShelfSort(params.sort) ? params.sort : "added";
  const groupBy: GroupBy = isKeyOf(GROUPINGS, params.groupBy) ? params.groupBy : "none";
  const view: View = isKeyOf(VIEWS, params.view) ? params.view : "grid";

  const mine = eq(entryCards.userId, user.id);

  const tagOptions = await tagsWithCounts(user.id);
  const tag = tagOptions.find((option) => option.slug === params.tag);

  const rows = await shelfRows(user.id, { status, tag: tag?.slug, sort });
  // A tag picks out entries, so it shows them as themselves: a run folded
  // under a tag that only some of its issues carry would claim the rest.
  const folded = foldRuns(rows, tag ? new Map() : await completeRuns(user.id));

  const counts = await db
    .select({ status: entryCards.status, n: count() })
    .from(entryCards)
    .where(mine)
    .groupBy(entryCards.status);
  const countOf = (shelf: Shelf) => counts.find((c) => c.status === shelf)?.n ?? 0;
  const everything = counts.reduce((sum, c) => sum + c.n, 0);

  const year = new Date().getFullYear();
  const finished = await finishedThisYear(user.id, year);

  // A series group reads in series order (§2), whatever the sort says: the
  // point of grouping by series is seeing #1, #2, #3. Stable, so the chosen
  // sort still orders books that share a position or have none.
  //
  // Likewise a year-finished group reads newest finish first: the grouping is
  // the question "what did I read in 2025", and the answer reads backwards
  // through the year.
  //
  // A collection group reads series by series, each in its order, the series
  // in the order they began (their earliest book on the shelf), and books with
  // no series by year among them — the collection page's order.
  const seriesBegan = new Map<string, number>();
  for (const row of rows) {
    if (!row.seriesId) continue;
    const year = row.year ?? Number.POSITIVE_INFINITY;
    seriesBegan.set(row.seriesId, Math.min(seriesBegan.get(row.seriesId) ?? Number.POSITIVE_INFINITY, year));
  }
  const inCollectionOrder = ({ row: a }: FoldedRow, { row: b }: FoldedRow) => {
    const startA = a.seriesId ? seriesBegan.get(a.seriesId)! : (a.year ?? Number.POSITIVE_INFINITY);
    const startB = b.seriesId ? seriesBegan.get(b.seriesId)! : (b.year ?? Number.POSITIVE_INFINITY);
    if (startA !== startB) return startA - startB;
    if (a.seriesId !== b.seriesId) return (a.seriesName ?? "").localeCompare(b.seriesName ?? "");
    return (a.seriesPosition ?? Number.POSITIVE_INFINITY) - (b.seriesPosition ?? Number.POSITIVE_INFINITY);
  };

  const ordered =
    groupBy === "collection"
      ? [...folded].sort(inCollectionOrder)
      : groupBy === "series"
        ? [...folded].sort(
            ({ row: a }, { row: b }) =>
              (a.seriesPosition ?? Number.POSITIVE_INFINITY) -
              (b.seriesPosition ?? Number.POSITIVE_INFINITY),
          )
        : groupBy === "finished"
          ? [...folded].sort(({ row: a }, { row: b }) => (b.lastFinishedOn ?? "").localeCompare(a.lastFinishedOn ?? ""))
          : folded;

  const groups = new Map<string, { order: number | string; cards: ShelfCard[] }>();
  for (const item of ordered) {
    const { label, order } = bucketFor(item.row, groupBy);
    const group = groups.get(label) ?? { order, cards: [] };
    group.cards.push(toCard(item));
    groups.set(label, group);
  }
  const sections: ShelfSection[] = [...groups.entries()]
    .sort((a, b) =>
      typeof a[1].order === "number" && typeof b[1].order === "number"
        ? a[1].order - b[1].order
        : String(a[1].order).localeCompare(String(b[1].order)),
    )
    .map(([label, group]) => {
      // Grouped by shelf, a heading opens that shelf on its own.
      const shelf = groupBy === "shelf" ? SHELVES.find((one) => SHELF_LABELS[one] === label) : undefined;
      return {
        label,
        href: shelf ? hrefWith(params, { status: shelf, show: undefined, groupBy: undefined }) : undefined,
        cards: group.cards,
      };
    });

  const landedId = params.added ?? params.already;
  const landed = landedId ? rows.find((row) => row.entryId === landedId) : undefined;

  const notice = landed ? (
    <p role="status" className="mb-4 border-l-2 border-accent pl-3 font-narrow">
      {params.added ? "Added" : "Already on your shelf"}: {landed.workTitle}, {landed.editionName}.
    </p>
  ) : null;

  // A bare "/" is the room: the reading band, then a strip per shelf. Asking
  // for a shelf, a tag or the whole wall is asking for the wall.
  if (!status && !tag && params.show !== "all") {
    const cards = folded.map(toCard);
    const finishedKey = new Map(
      folded.map(({ row }) => [
        row.entryId ?? "",
        `${row.lastFinishedOn ?? ""} ${row.updatedAt?.toISOString() ?? ""}`,
      ]),
    );
    const rooms = ROOMS.map((room) => {
      const all = cards.filter((card) => card.status === room.shelf);
      // Finished reads newest-finished first: what you last put down is what
      // you came to rate or talk about. Finishes are dates, so two on one day
      // go by which entry changed last, and the one you just finished leads.
      if (room.shelf === "finished") {
        all.sort((a, b) => (finishedKey.get(b.entryId) ?? "").localeCompare(finishedKey.get(a.entryId) ?? ""));
      }
      return { ...room, count: all.length, cards: all.slice(0, STRIP_LENGTH) };
    }).filter((room) => room.count > 0);

    const reading = cards.filter((card) => card.status === "reading");
    let tileIndex = 0;

    return (
      <main className="flex-1">
        <RememberShelfView query={queryFor(params)} />
        {notice ? <div className="px-4 pt-4 sm:px-10">{notice}</div> : null}
        <ReadingNow cards={reading.slice(0, STRIP_LENGTH)} count={reading.length} seeAll={hrefWith({}, { status: "reading" })} />

        <ResolveOnce>
          <div className="px-4 pb-14 sm:px-10">
            {rooms.map((room) => (
              <section key={room.shelf} className="mt-8">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-display text-2xl sm:text-[26px]">{room.title}</h2>
                  <span className="text-ink-dim">{room.count}</span>
                  <div className="flex-1" />
                  <Link
                    href={hrefWith({}, { status: room.shelf })}
                    className="font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                  >
                    See all {room.count}
                  </Link>
                </div>
                <ul className="shelf-strip">
                  {room.cards.map((card) => (
                    <Tile key={card.entryId} card={card} index={tileIndex++} className="w-[28vw] max-w-32 sm:w-32" />
                  ))}
                </ul>
                <div className="plank" />
              </section>
            ))}

            {everything === 0 ? (
              <p className="mt-8 font-narrow text-ink-dim">
                Nothing on your shelf yet.{" "}
                <Link href="/search" className="underline hover:text-ink">
                  Search for a book
                </Link>{" "}
                to start one.
              </p>
            ) : (
              <p className="mt-10 font-narrow text-ink-dim">
                {/* The entire stats feature (§5). There is no stats page. */}
                {finished > 0 ? `${finished} finished in ${year}. ` : ""}
                {everything} {everything === 1 ? "book" : "books"} on your shelves.
              </p>
            )}
          </div>
        </ResolveOnce>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 pt-4 pb-14 sm:px-10">
      <RememberShelfView query={queryFor(params)} />
      {notice}

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl sm:text-4xl">{status ? SHELF_LABELS[status] : groupBy === "shelf" ? "All shelves" : "All books"}</h1>
        {/* The entire stats feature (§5). There is no stats page. */}
        {finished > 0 ? (
          <span className="text-ink-dim">
            {finished} finished in {year}
          </span>
        ) : null}
      </div>

      {/* One row on a phone, scrolled sideways, rather than wrapping into
          rows of tabs above the first cover. */}
      <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="segmented inline-flex">
          <Link
            href={hrefWith(params, { status: undefined, show: "all" })}
            aria-current={status ? undefined : "page"}
          >
            All {everything}
          </Link>
          {SHELVES.map((shelf) => (
            <Link
              key={shelf}
              href={hrefWith(params, { status: shelf, show: undefined })}
              aria-current={status === shelf ? "page" : undefined}
            >
              {SHELF_LABELS[shelf]} {countOf(shelf)}
            </Link>
          ))}
        </div>
      </nav>

      <FilterForm defaults={{ sort: "added", groupBy: "none", view: "grid" }}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {!status ? <input type="hidden" name="show" value="all" /> : null}

        {tagOptions.length > 0 ? (
          <select name="tag" defaultValue={tag?.slug ?? ""} aria-label="Tag" className={SELECT}>
            <option value="">All tags</option>
            {tagOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name} ({option.n})
              </option>
            ))}
          </select>
        ) : null}

        <select name="sort" defaultValue={sort} aria-label="Sort" className={SELECT}>
          {Object.entries(SHELF_SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select name="groupBy" defaultValue={groupBy} aria-label="Group" className={SELECT}>
          {Object.entries(GROUPINGS).map(([value, label]) => (
            <option key={value} value={value}>
              {value === "none" ? label : `Group by ${label.toLowerCase()}`}
            </option>
          ))}
        </select>

        <select name="view" defaultValue={view} aria-label="Layout" className={SELECT}>
          {Object.entries(VIEWS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FilterForm>

      {everything === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing on your shelf yet.{" "}
          <Link href="/search" className="underline hover:text-ink">
            Search for a book
          </Link>{" "}
          to start one.
        </p>
      ) : rows.length === 0 && (status || tag) ? (
        <p className="font-narrow text-ink-dim">
          Nothing {status ? `on ${SHELF_LABELS[status]}` : ""}
          {status && tag ? " " : ""}
          {tag ? `tagged ${tag.name}` : ""} yet.
        </p>
      ) : (
        <ShelfGrid
          sections={sections}
          grouped={groupBy !== "none"}
          view={view}
          tags={tagOptions.map(({ slug, name }) => ({ slug, name }))}
        />
      )}
    </main>
  );
}
