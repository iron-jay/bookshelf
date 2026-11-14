import { ApiError, json, readObject, withUser } from "@/lib/api";
import { formFrom } from "@/lib/books/edit-details";
import { addByHand, BY_HAND_FIELDS } from "@/lib/books/add-by-hand";
import { refreshEntryPages } from "@/lib/api/refresh";

export const dynamic = "force-dynamic";

/**
 * An edition typed in by hand, as the web's one form (§5): Door A's "Create
 * it manually" (`title`, `authors` comma-separated, and the book's other
 * details: `subtitle`, `authorSort`, `year`, `summary`, `series`, `position`)
 * or Door B's "Add edition" (`workId`). Then the edition: `kind`, `name`,
 * `format`, `credit`, `hours`, `minutes`, `language`, `baseEditionId`, `url`,
 * `notes`, and `shelf`. Strings, as the form sends them, read by its rules; a
 * refusal is `invalid` with its message. 201 with `{ entryId, editionId,
 * workId }`.
 */
export const POST = withUser(async (request, { user }) => {
  const result = await addByHand(user.id, formFrom(await readObject(request), BY_HAND_FIELDS));
  if (!result.ok) throw new ApiError("invalid", result.error);
  refreshEntryPages(result.added.editionId);
  return json(result.added, { status: 201 });
});
