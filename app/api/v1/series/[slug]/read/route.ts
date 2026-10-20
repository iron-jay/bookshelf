import { revalidatePath } from "next/cache";

import { ApiError, json, optionalDate, readObject, withUser } from "@/lib/api";
import { seriesDetail } from "@/lib/books/read";
import { readSeries } from "@/lib/books/series-read";
import { today } from "@/lib/books/shelving";

export const dynamic = "force-dynamic";

/**
 * The whole series read: every book in it to Finished on `finishedOn` (today
 * if left out), as the series page's button does. Books already finished are
 * left alone; ones not on your shelf go on it in their first edition. Returns
 * how many changed and the series as GET answers it.
 */
export const POST = withUser<{ slug: string }>(async (request, { params, user }) => {
  const slug = decodeURIComponent((await params).slug);
  const body = await readObject(request);
  const finishedOn = optionalDate(body.finishedOn, "finishedOn") ?? today();

  const before = await seriesDetail(user.id, slug);
  if (!before) throw new ApiError("not_found", "No such series.");

  const counts = await readSeries(user.id, before.id, finishedOn);
  revalidatePath(`/series/${before.slug}`);
  revalidatePath("/");
  return json({ ...counts, series: await seriesDetail(user.id, slug) });
});
