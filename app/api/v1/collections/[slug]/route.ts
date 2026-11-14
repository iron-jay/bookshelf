import { ApiError, json, withUser } from "@/lib/api";
import { collectionDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

/** A collection: its series in the order they began, each in reading order, then its books with no series. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await collectionDetail(user.id, decodeURIComponent((await params).slug));
  if (!detail) throw new ApiError("not_found", "No such collection.");
  return json(detail);
});
