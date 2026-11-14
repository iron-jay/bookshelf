import { and, eq } from "drizzle-orm";

import { ApiError, json, withUser } from "@/lib/api";
import { refreshSeriesPages } from "@/lib/api/refresh";
import { seriesDetail } from "@/lib/books/read";
import { takeOutOfSeries } from "@/lib/books/series";
import { db } from "@/lib/db";
import { series, works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Takes one book out of the series; it keeps the series' collection. Answers
 * with what is left, or `{ "series": null }` once the last book is out and the
 * series is gone.
 */
export const DELETE = withUser<{ slug: string; workSlug: string }>(async (_request, { params, user }) => {
  const { slug: rawSlug, workSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const [found] = await db
    .select({ workId: works.id })
    .from(works)
    .innerJoin(series, eq(series.id, works.seriesId))
    .where(and(eq(series.slug, slug), eq(works.slug, decodeURIComponent(workSlug))));
  if (!found) throw new ApiError("not_found", "That book isn't in this series.");

  await db.transaction((tx) => takeOutOfSeries(tx, found.workId, user.id));
  refreshSeriesPages();
  return json({ series: await seriesDetail(user.id, slug) });
});
