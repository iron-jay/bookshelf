import { and, asc, count, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, entryCards, entryTags, reads, tags } from "@/lib/db/schema";
import { isShelf, SHELF_LABELS, SHELVES, type Shelf } from "@/lib/shelves";

import { FilterForm } from "./filter-form";
import { RememberShelfView } from "./remember-shelf-view";
import type { ShelfCard } from "./shelf-card";
import { ShelfGrid, type ShelfSection } from "./shelf-grid";
import { preferencesFrom, SHELF_VIEW_COOKIE } from "./shelf-view";

export const dynamic = "force-dynamic";

const SORTS = {
  added: "Recently added",
  title: "Title",
  author: "Author",
  rated: "Rating",
  finished: "Last finished",
} as const;
type Sort = keyof typeof SORTS;

// Every sort ends on something unique-ish, so the order is stable between
// renders rather than shuffling ties.
const ORDER_BY: Readonly<Record<Sort, SQL>> = {
  added: sql`added_at desc`,
  title: sql`lower(work_title), edition_name, added_at desc`,
  author: sql`lower(author_sort) nulls last, lower(work_title), added_at desc`,
  rated: sql`rating desc nulls last, added_at desc`,
  finished: sql`last_finished_on desc nulls last, added_at desc`,
};

const GROUPINGS = {
  none: "No grouping",
  shelf: "Shelf",
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
  added?: string;
  already?: string;
};

function isKeyOf<T extends object>(table: T, value: string | undefined): value is Extract<keyof T, string> {
  return value !== undefined && Object.hasOwn(table, value);
}

/** The URL-state part of the params: not the one-off added/already notice. */
function queryFor(params: Params): string {
  const query = new URLSearchParams();
  for (const key of ["status", "tag", "sort", "groupBy", "view"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  return query.toString();
}

function hrefWith(current: Params, patch: Params): string {
  const qs = queryFor({ ...current, ...patch });
  return qs ? `/?${qs}` : "/";
}

const SELECT = "border border-line bg-panel px-2 py-1.5 text-ink";

type Row = typeof entryCards.$inferSelect;

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

function toCard(row: Row): ShelfCard {
  return {
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
    isCommunityEdition: row.isCommunityEdition ?? false,
    lastFinishedOn: row.lastFinishedOn,
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
  const sort: Sort = isKeyOf(SORTS, params.sort) ? params.sort : "added";
  const groupBy: GroupBy = isKeyOf(GROUPINGS, params.groupBy) ? params.groupBy : "none";
  const view: View = isKeyOf(VIEWS, params.view) ? params.view : "grid";

  const mine = eq(entryCards.userId, user.id);

  // Your tags that something carries, with counts, so the filter never offers
  // a choice that returns nothing.
  const tagOptions = await db
    .select({ slug: tags.slug, name: tags.name, n: count() })
    .from(tags)
    .innerJoin(entryTags, eq(entryTags.tagId, tags.id))
    .where(eq(tags.userId, user.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  const tag = tagOptions.find((option) => option.slug === params.tag);

  const filters = [mine];
  if (status) filters.push(eq(entryCards.status, status));
  if (tag) {
    filters.push(
      inArray(
        entryCards.entryId,
        db
          .select({ id: entryTags.entryId })
          .from(entryTags)
          .innerJoin(tags, eq(tags.id, entryTags.tagId))
          .where(and(eq(tags.userId, user.id), eq(tags.slug, tag.slug))),
      ),
    );
  }

  const rows = await db
    .select()
    .from(entryCards)
    .where(and(...filters))
    .orderBy(ORDER_BY[sort]);

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
  const ordered =
    groupBy === "series"
      ? [...rows].sort(
          (a, b) =>
            (a.seriesPosition ?? Number.POSITIVE_INFINITY) -
            (b.seriesPosition ?? Number.POSITIVE_INFINITY),
        )
      : groupBy === "finished"
        ? [...rows].sort((a, b) => (b.lastFinishedOn ?? "").localeCompare(a.lastFinishedOn ?? ""))
        : rows;

  const groups = new Map<string, { order: number | string; cards: ShelfCard[] }>();
  for (const row of ordered) {
    const { label, order } = bucketFor(row, groupBy);
    const group = groups.get(label) ?? { order, cards: [] };
    group.cards.push(toCard(row));
    groups.set(label, group);
  }
  const sections: ShelfSection[] = [...groups.entries()]
    .sort((a, b) =>
      typeof a[1].order === "number" && typeof b[1].order === "number"
        ? a[1].order - b[1].order
        : String(a[1].order).localeCompare(String(b[1].order)),
    )
    .map(([label, group]) => ({ label, cards: group.cards }));

  const landedId = params.added ?? params.already;
  const landed = landedId ? rows.find((row) => row.entryId === landedId) : undefined;

  return (
    <main className="flex-1 p-6">
      <RememberShelfView query={queryFor(params)} />

      {landed ? (
        <p role="status" className="mb-4 border-l-2 border-ink-dim pl-3 font-narrow">
          {params.added ? "Added" : "Already on your shelf"}: {landed.workTitle},{" "}
          {landed.editionName}.
        </p>
      ) : null}

      <nav className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 font-narrow">
        <Link
          href={hrefWith(params, { status: undefined })}
          className={status ? "text-ink-dim hover:text-ink" : "font-medium"}
        >
          All <span className="text-ink-dim">{everything}</span>
        </Link>
        {SHELVES.map((shelf) => (
          <Link
            key={shelf}
            href={hrefWith(params, { status: shelf })}
            className={status === shelf ? "font-medium" : "text-ink-dim hover:text-ink"}
          >
            {SHELF_LABELS[shelf]} <span className="text-ink-dim">{countOf(shelf)}</span>
          </Link>
        ))}
        {/* The entire stats feature (§5). There is no stats page. */}
        {finished > 0 ? (
          <span className="ml-auto text-ink-dim">
            {finished} finished in {year}
          </span>
        ) : null}
      </nav>

      <FilterForm defaults={{ sort: "added", groupBy: "none", view: "grid" }}>
        {status ? <input type="hidden" name="status" value={status} /> : null}

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
          {Object.entries(SORTS).map(([value, label]) => (
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
