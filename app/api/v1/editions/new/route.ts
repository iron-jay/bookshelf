import { ApiError, json, withUser } from "@/lib/api";
import { byHandLanguages, byHandWork } from "@/lib/books/add-by-hand";
import { seriesNames } from "@/lib/books/draft";
import { EDITION_KIND_OPTIONS } from "@/lib/books/edition-facts";

export const dynamic = "force-dynamic";

/**
 * What the by-hand form offers: `kinds`, `languages`, the `seriesNames` here,
 * and with `?work=` (Door B) that book (`id`, `slug`, `title`, `authors`,
 * `olWorkKey`, and its `editions` to base one on).
 */
export const GET = withUser(async (request) => {
  const workId = new URL(request.url).searchParams.get("work");
  const work = workId ? await byHandWork(workId) : null;
  if (workId && !work) throw new ApiError("not_found", "No such work.");
  return json({ work, kinds: EDITION_KIND_OPTIONS, languages: byHandLanguages(), seriesNames: work ? [] : await seriesNames() });
});
