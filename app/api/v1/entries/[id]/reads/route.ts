import { ApiError, json, optionalDate, readObject, uuidParam, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import { editionForEntry, readAgainFor } from "@/lib/books/entries";
import { entryDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

/**
 * "Read again": a new read started today, and the entry back on Reading.
 * Returns the entry. An optional `{ on }` body starts it that day instead.
 */
export const POST = withUser<{ id: string }>(async (request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  // No body at all is the original call, and still fine.
  const body = request.headers.get("content-type")?.includes("json") ? await readObject(request) : {};
  const on = optionalDate(body.on, "on");
  const editionId = await editionForEntry(user.id, id);
  if (!editionId) throw new ApiError("not_found", "No such entry.");

  await readAgainFor(id, on);
  refreshEntryPages(editionId);

  const detail = await entryDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such entry.");
  return json(entryJson(detail), { status: 201 });
});
