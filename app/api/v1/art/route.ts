import { json, withUser } from "@/lib/api";
import { flaggedCovers } from "@/lib/books/art-review";

export const dynamic = "force-dynamic";

/**
 * Cover art to review (`/art`): covers found by title on books of yours, each
 * `kind` (`work` or `edition`) and `id` for `/covers/{kind}/{id}` (approve
 * there, or change), with `title`, `subtitle`, `authors`, `coverUrl`, `workSlug`.
 */
export const GET = withUser(async (_request, { user }) => json({ items: await flaggedCovers(user.id) }));
