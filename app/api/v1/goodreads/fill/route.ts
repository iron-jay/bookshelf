import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { refreshEntryPages } from "@/lib/api/refresh";
import { applyGoodreadsFill, checkPageData } from "@/lib/books/goodreads-fill";

export const dynamic = "force-dynamic";

/**
 * Fills a book of yours from its Goodreads page (`{ book, editionId? }`), as
 * Apply does on the web: only empty fields (description, year, series, and a
 * cover when it has none). Without `editionId`, the edition with the page's
 * Goodreads id; with one (the `shelved` preview's), that edition, linked to
 * the page. Answers what was filled.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const data = checkPageData(body.book);
  if (!data) throw new ApiError("invalid", "That did not look like a Goodreads book page.", { fields: { book: "Invalid." } });
  const editionId = body.editionId === undefined || body.editionId === null ? undefined : uuidParam(String(body.editionId), "edition");
  const result = await applyGoodreadsFill(user.id, data, false, editionId);
  if ("error" in result) throw new ApiError("not_found", result.error);
  refreshEntryPages(result.target.editionId);
  return json({ editionId: result.target.editionId, filled: result.filled });
});
