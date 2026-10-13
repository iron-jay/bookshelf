import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { refreshEntryPages } from "@/lib/api/refresh";
import { deleteRead, ownRead, readsOf, updateRead } from "@/lib/books/entries";

export const dynamic = "force-dynamic";

async function readOrNotFound(userId: string, id: string) {
  const read = await ownRead(userId, uuidParam(id, "read"));
  if (!read) throw new ApiError("not_found", "No such read.");
  return read;
}

/**
 * `startedOn` and `finishedOn`, each "YYYY-MM-DD" or null to clear. One left
 * out keeps its date. Returns the entry's reads.
 */
export const PATCH = withUser<{ id: string }>(async (request, { params, user }) => {
  const read = await readOrNotFound(user.id, (await params).id);
  const body = await readObject(request);

  const fields: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (key !== "startedOn" && key !== "finishedOn") fields[key] = "Not a field that can be changed.";
    else if (body[key] !== null && typeof body[key] !== "string") fields[key] = "A date, or null.";
  }
  if (Object.keys(fields).length > 0) {
    throw new ApiError("invalid", "Some fields could not be saved.", { fields });
  }

  const current = (await readsOf(read.entryId)).find((r) => r.id === read.id);
  const pick = (key: "startedOn" | "finishedOn") =>
    key in body ? ((body[key] as string | null) ?? "") : (current?.[key] ?? "");

  const error = await updateRead(read.id, { startedOn: pick("startedOn"), finishedOn: pick("finishedOn") });
  if (error) throw new ApiError("invalid", error);

  refreshEntryPages(read.editionId);
  return json({ reads: await readsOf(read.entryId) });
});

export const DELETE = withUser<{ id: string }>(async (_request, { params, user }) => {
  const read = await readOrNotFound(user.id, (await params).id);
  await deleteRead(read.id);
  refreshEntryPages(read.editionId);
  return new Response(null, { status: 204 });
});
