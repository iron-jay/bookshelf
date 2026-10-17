import { ApiError, json, withUser } from "@/lib/api";
import { seriesDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

/** A series: its works in reading order, your entries on each, and its collection. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await seriesDetail(user.id, decodeURIComponent((await params).slug));
  if (!detail) throw new ApiError("not_found", "No such series.");
  return json(detail);
});
