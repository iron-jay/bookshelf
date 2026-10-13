import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import {
  editionForEntry,
  isRating,
  removeEntry,
  REVIEW_MAX,
  updateEntry,
  type EntryChanges,
} from "@/lib/books/entries";
import { entryDetail } from "@/lib/books/read";
import { isShelf } from "@/lib/shelves";

export const dynamic = "force-dynamic";

async function detailOrNotFound(userId: string, entryId: string) {
  const detail = await entryDetail(userId, entryId);
  if (!detail) throw new ApiError("not_found", "No such entry.");
  return detail;
}

/** One entry: its card, plus the review, flags, tags and reads. */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  return json(entryJson(await detailOrNotFound(user.id, id)));
});

/**
 * Turns a PATCH body into changes, refusing the whole body if any field is
 * wrong. A partial save would leave the phone showing values the server never
 * took, and every field it names is one it meant to change.
 */
function changesFrom(body: Record<string, unknown>): EntryChanges {
  const changes: EntryChanges = {};
  const fields: Record<string, string> = {};

  for (const key of Object.keys(body)) {
    const value = body[key];
    switch (key) {
      case "shelf":
        if (isShelf(value)) changes.shelf = value;
        else fields.shelf = "Not one of the shelves /meta lists.";
        break;
      case "rating":
        if (value === null || isRating(value)) changes.rating = value;
        else fields.rating = "A whole number from 1 to 10, or null.";
        break;
      case "review":
        if (value === null) changes.review = null;
        else if (typeof value !== "string") fields.review = "Text, or null.";
        else if (value.length > REVIEW_MAX) fields.review = `At most ${REVIEW_MAX} characters.`;
        else changes.review = value;
        break;
      case "reviewHasSpoilers":
      case "isFavourite":
      case "isPrivate":
        if (typeof value === "boolean") changes[key] = value;
        else fields[key] = "Must be true or false.";
        break;
      default:
        fields[key] = "Not a field that can be changed.";
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError("invalid", "Some fields could not be saved.", { fields });
  }
  return changes;
}

/**
 * Changes any of shelf, rating, review, reviewHasSpoilers, isFavourite and
 * isPrivate. Fields left out are left alone. A shelf change follows the same
 * read rules as the web: Reading opens a read, Finished closes one.
 */
export const PATCH = withUser<{ id: string }>(async (request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  const changes = changesFrom(await readObject(request));

  const editionId = await editionForEntry(user.id, id);
  if (!editionId) throw new ApiError("not_found", "No such entry.");

  await updateEntry(id, changes);
  refreshEntryPages(editionId);
  return json(entryJson(await detailOrNotFound(user.id, id)));
});

/** Takes it off your shelf, with its rating, review, reads and tags. The book stays on the server. */
export const DELETE = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  const editionId = await editionForEntry(user.id, id);
  if (!editionId) throw new ApiError("not_found", "No such entry.");

  await removeEntry(id);
  refreshEntryPages(editionId);
  return new Response(null, { status: 204 });
});
