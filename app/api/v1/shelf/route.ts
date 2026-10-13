import { ApiError, json, pageFrom, withUser } from "@/lib/api";
import { cardFrom } from "@/lib/api/cards";
import { isShelfSort, SHELF_SORTS, shelfRows } from "@/lib/books/shelf";
import { isShelf } from "@/lib/shelves";

export const dynamic = "force-dynamic";

/**
 * Your shelf as cards: `shelf`, `tag` (a slug), `sort` and paging. The same
 * query as the web shelf, so the two never disagree about what is on it.
 * Grouping is left to the phone, which has the fields to do it.
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

  const rows = await shelfRows(user.id, {
    status: shelf,
    tag: url.searchParams.get("tag") || undefined,
    sort,
  });

  return json({
    total: rows.length,
    limit,
    offset,
    items: rows.slice(offset, offset + limit).map(cardFrom),
  });
});
