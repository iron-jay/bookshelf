import { ApiError, json, withUser } from "@/lib/api";
import { catalogueWorkHere, hardcoverBook } from "@/lib/books/add-from-catalogue";
import { draftFromCatalogue } from "@/lib/books/draft";
import { hardcoverEnabled } from "@/lib/hardcover";

export const dynamic = "force-dynamic";

/**
 * A book only Hardcover has, as adding it would save it: `details` to edit
 * and send back with `POST /entries` (null when it is here already). Reads only.
 */
export const GET = withUser<{ id: string }>(async (_request, { params }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || id >= 2_147_483_648) throw new ApiError("not_found", "No such book.");
  if (!hardcoverEnabled()) throw new ApiError("upstream", "This server has no Hardcover token.");
  const book = await hardcoverBook(id);
  if (!book) throw new ApiError("upstream", "Hardcover did not answer, or has no such book.");
  const here = await catalogueWorkHere(book.key);
  return json({ hardcoverId: id, coverUrl: book.coverUrl, here, details: here ? null : draftFromCatalogue(book) });
});
