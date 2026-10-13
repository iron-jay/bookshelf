import { ApiError, json, withUser } from "@/lib/api";
import { workDetail } from "@/lib/books/read";

export const dynamic = "force-dynamic";

/** A work, its editions (with your entry on each), its series and collection. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await workDetail(user.id, (await params).slug);
  if (!detail) throw new ApiError("not_found", "No such work.");
  return json(detail);
});
