import { ApiError, json, readObject, withUser } from "@/lib/api";
import { previewGoodreadsAdd } from "@/lib/books/add-from-goodreads";
import { checkPageData, findGoodreadsTarget, type GoodreadsTarget } from "@/lib/books/goodreads-fill";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

export const dynamic = "force-dynamic";

function shelvedJson(kind: "linked" | "shelved", target: GoodreadsTarget, data: GoodreadsPageData) {
  const m = target.missing;
  return {
    kind,
    editionId: target.editionId,
    title: target.workTitle,
    editionName: target.editionName,
    // What the page could fill in, as `POST /goodreads/fill` would.
    canFill: (m.description && !!data.description) || (m.year && !!data.year) || (m.series && !!data.series) || (m.cover && !!data.coverUrl),
  };
}

/**
 * What a Goodreads page (`{ book }`, as `extract` read it) is to you, as the
 * web's /goodreads-fill page decides: `linked` when one of your editions has
 * its Goodreads id, `shelved` when one has its ISBN, else `add`, with where
 * it would go (`match`), the book's title when it is here already, and
 * otherwise `details` to edit and send back with `POST /entries`. Reads only.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const data = checkPageData(body.book);
  if (!data) throw new ApiError("invalid", "That did not look like a Goodreads book page.", { fields: { book: "Invalid." } });

  const linked = await findGoodreadsTarget(user.id, data.goodreadsId);
  if (linked) return json({ book: data, ...shelvedJson("linked", linked, data) });

  const preview = await previewGoodreadsAdd(user.id, data);
  if (preview.kind === "error") throw new ApiError("upstream", preview.error);
  if (preview.kind === "shelved") return json({ book: data, ...shelvedJson("shelved", preview.target, data) });
  return json({ book: data, kind: "add", match: preview.match, title: preview.workTitle, details: preview.draft });
});
