import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { refreshEntryPages } from "@/lib/api/refresh";
import { editionForEntry, ownTag, tagEntry, untagEntry } from "@/lib/books/entries";
import { entryDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

type Params = { id: string; name: string };

/**
 * Tags are addressed by name rather than id, so the phone can tag something
 * with a name nobody has used yet in one call, the way the web's box does.
 */
async function target(params: Promise<Params>, userId: string) {
  const { id, name } = await params;
  const entryId = uuidParam(id, "entry");
  const editionId = await editionForEntry(userId, entryId);
  if (!editionId) throw new ApiError("not_found", "No such entry.");
  return { entryId, editionId, name };
}

async function tagsOf(userId: string, entryId: string) {
  return (await entryDetail(userId, entryId))?.tags ?? [];
}

/** Adds the tag, creating it if it is new. Doing it twice is harmless. */
export const PUT = withUser<Params>(async (_request, { params, user }) => {
  const { entryId, editionId, name } = await target(params, user.id);
  if (!(await tagEntry(user.id, entryId, name))) {
    throw new ApiError("invalid", "A tag needs a name.", { fields: { name: "Required." } });
  }
  refreshEntryPages(editionId);
  return json({ tags: await tagsOf(user.id, entryId) });
});

/** Removes the tag from this entry; one left on nothing is deleted. A tag it did not have is already gone. */
export const DELETE = withUser<Params>(async (_request, { params, user }) => {
  const { entryId, editionId, name } = await target(params, user.id);
  const tagId = await ownTag(user.id, { name });
  if (tagId) {
    await untagEntry(tagId, entryId);
    refreshEntryPages(editionId);
  }
  return json({ tags: await tagsOf(user.id, entryId) });
});
