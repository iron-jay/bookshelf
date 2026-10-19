import { ApiError, json, pageFrom, withUser } from "@/lib/api";
import { cardFrom } from "@/lib/api/cards";
import { completeRuns, foldRuns } from "@/lib/books/runs";
import { isShelfSort, SHELF_SORTS, shelfRows } from "@/lib/books/shelf";
import { isShelf } from "@/lib/shelves";

export const dynamic = "force-dynamic";

/**
 * Your shelf as cards: `shelf`, `tag` (a slug), `sort` and paging. The same
 * query as the web shelf, so the two never disagree about what is on it.
 * Grouping is left to the phone, which has the fields to do it.
 *
 * `runs=fold` stacks each comic run read to the end into one card, as the web
 * shelf does (lib/books/runs.ts); left out, every entry is its own card, so a
 * phone that does not know about runs sees what it always did. Not with a
 * tag, which picks out entries.
 */
export const GET = withUser(async (request, { user }) => {
  const url = new URL(request.url);
  const { limit, offset } = pageFrom(url);

  const shelf = url.searchParams.get("shelf") || undefined;
  if (shelf !== undefined && !isShelf(shelf)) {
    throw new ApiError("invalid", "Not one of the shelves /meta lists.", {
      fields: { shelf: "Unknown shelf." },
    });
  }
  const sort = url.searchParams.get("sort") || undefined;
  if (sort !== undefined && !isShelfSort(sort)) {
    throw new ApiError("invalid", `sort must be one of ${Object.keys(SHELF_SORTS).join(", ")}.`, {
      fields: { sort: "Unknown sort." },
    });
  }

  const runs = url.searchParams.get("runs") || undefined;
  if (runs !== undefined && runs !== "fold") {
    throw new ApiError("invalid", "runs is fold, or left out.", { fields: { runs: "Unknown." } });
  }

  const tag = url.searchParams.get("tag") || undefined;
  const rows = await shelfRows(user.id, { status: shelf, tag, sort });
  const items = foldRuns(rows, runs && !tag ? await completeRuns(user.id) : new Map());

  return json({
    total: items.length,
    limit,
    offset,
    items: items.slice(offset, offset + limit).map(({ row, run }) => cardFrom(row, run)),
  });
});
