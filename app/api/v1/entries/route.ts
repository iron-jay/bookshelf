import { ApiError, json, readObject, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import { editionExists } from "@/lib/books/entries";
import { entryDetail } from "@/lib/books/read";
import { shelveEdition } from "@/lib/books/shelving";
import { db } from "@/lib/db";
import { isShelf, type Shelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * Puts an edition on this server on your shelf: `{ editionId, shelf? }`. The
 * shelf's read rules apply, so Reading opens a read today and Finished records
 * one. 201 when added, 200 when it was already there; an entry already on the
 * shelf keeps its shelf, as on the web.
 *
 * Adding from Open Library or Hardcover means choosing an edition first, which
 * the web's add pages do; the phone opens them through a search result's
 * `webPath` for now.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);

  let shelf: Shelf = "tbr";
  if (body.shelf !== undefined) {
    if (!isShelf(body.shelf)) {
      throw new ApiError("invalid", "Not one of the shelves /meta lists.", {
        fields: { shelf: "Unknown shelf." },
      });
    }
    shelf = body.shelf;
  }

  if (body.editionId === undefined) {
    throw new ApiError("invalid", "Send an editionId.", { fields: { editionId: "Required." } });
  }
  const editionId = body.editionId;
  if (typeof editionId !== "string" || !isUuid(editionId) || !(await editionExists(editionId))) {
    throw new ApiError("not_found", "No such edition.");
  }

  const { entryId, added } = await db.transaction((tx) => shelveEdition(tx, user.id, editionId, shelf));
  refreshEntryPages(editionId);

  const detail = await entryDetail(user.id, entryId);
  if (!detail) throw new ApiError("internal", "The entry could not be read back.");
  return json(entryJson(detail), { status: added ? 201 : 200 });
});
