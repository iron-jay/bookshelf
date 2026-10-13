import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { editionDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

/** An edition, its work, and your entry id when it is on your shelf. */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "edition");
  const detail = await editionDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such edition.");
  return json(detail);
});
