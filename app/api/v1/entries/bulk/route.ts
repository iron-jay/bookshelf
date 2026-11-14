import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { moveToShelf, putInSeries, tagAll, untagAll } from "@/lib/books/bulk";

export const dynamic = "force-dynamic";

/**
 * The wall's select mode: `{ entryIds, do, value }`, where `do` is `shelf`
 * (`value` a shelf), `tag` (a tag name, made if new), `untag` (a tag's slug)
 * or `series` (a series name; books keep a number they have there). Only
 * your own entries are touched. Answers `{ ok, message }` in the page's
 * words; a refusal is `invalid` with its message.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const ids = Array.isArray(body.entryIds) ? body.entryIds : [];
  const value = typeof body.value === "string" ? body.value : "";
  const run = { shelf: moveToShelf, tag: tagAll, untag: untagAll, series: putInSeries }[String(body.do)];
  if (!run) throw new ApiError("invalid", "Say what to do: shelf, tag, untag or series.", { fields: { do: "One of shelf, tag, untag, series." } });
  const result = await run(user.id, ids, value);
  if (!result.ok) throw new ApiError("invalid", result.message);
  revalidatePath("/", "layout");
  return json(result);
});
