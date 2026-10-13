import { json, withUser } from "@/lib/api";
import { tagsWithCounts } from "@/lib/books/shelf";

export const dynamic = "force-dynamic";

/** Your tags, each with how many entries carry it. */
export const GET = withUser(async (_request, { user }) => {
  const rows = await tagsWithCounts(user.id);
  return json({ items: rows.map(({ id, slug, name, n }) => ({ id, slug, name, count: n })) });
});
