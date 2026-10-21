import { ApiError, json, withUser } from "@/lib/api";
import { catalogueWorkHere, comicBook } from "@/lib/books/add-from-catalogue";
import { draftFromCatalogue } from "@/lib/books/draft";
import { comicvineEnabled } from "@/lib/comicvine";

export const dynamic = "force-dynamic";

/**
 * One Comic Vine issue as adding it would save it: `details` to edit and
 * send back with `POST /entries` (null when it is here already). A run's
 * series is its volume's, so `details.series` is left out for one. Reads only.
 */
export const GET = withUser<{ id: string }>(async (_request, { params }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || id >= 2_147_483_648) throw new ApiError("not_found", "No such issue.");
  if (!comicvineEnabled()) throw new ApiError("upstream", "This server has no Comic Vine key.");
  const book = await comicBook(id);
  if (!book) throw new ApiError("upstream", "Comic Vine did not answer, or has no such issue.");
  const here = await catalogueWorkHere(book.key);
  return json({ comicvineIssueId: id, coverUrl: book.coverUrl, here, details: here ? null : draftFromCatalogue(book) });
});
