import { eq } from "drizzle-orm";
import { ApiError, json, readObject, withUser } from "@/lib/api";
import { refreshSeriesPages } from "@/lib/api/refresh";
import { setCollection } from "@/lib/books/collections";
import { seriesDetail } from "@/lib/books/read";
import { countRunIfMissing } from "@/lib/books/runs";
import { removeSeries, renameSeries } from "@/lib/books/series";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** A series: its works in reading order, your entries on each, and its collection. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const slug = decodeURIComponent((await params).slug);
  const [found] = await db.select({ id: series.id, issueCount: series.issueCount }).from(series).where(eq(series.slug, slug));
  if (!found) throw new ApiError("not_found", "No such series.");
  // As the web page does: a comic run from before issue counts learns its count once.
  if (found.issueCount === null) await countRunIfMissing(found.id);
  return json(await seriesDetail(user.id, slug));
});

/**
 * `{ "name": "Discworld" }` renames the series; a name already here joins the
 * two, keeping their numbers (two Comic Vine runs never join). `{ "collection":
 * "Halo" }` puts every book in it in that collection; "" takes them out. Both
 * may come at once. Answers with the series, under its new slug if renamed.
 */
export const PATCH = withUser<{ slug: string }>(async (request, { params, user }) => {
  let slug = decodeURIComponent((await params).slug);
  const body = await readObject(request);
  if (body.name !== undefined && typeof body.name !== "string") {
    throw new ApiError("invalid", "name is text.", { fields: { name: "Must be text." } });
  }
  if (body.collection !== undefined && typeof body.collection !== "string") {
    throw new ApiError("invalid", "collection is text.", { fields: { collection: "Must be text." } });
  }

  const [found] = await db.select({ id: series.id }).from(series).where(eq(series.slug, slug));
  if (!found) throw new ApiError("not_found", "No such series.");

  if (typeof body.collection === "string") {
    const name = body.collection;
    await db.transaction((tx) => setCollection(tx, { kind: "series", id: found.id }, name, user.id));
  }
  if (typeof body.name === "string") {
    const name = body.name;
    const renamed = await db.transaction((tx) => renameSeries(tx, found.id, name));
    if ("error" in renamed) throw new ApiError("invalid", renamed.error, { fields: { name: renamed.error } });
    slug = renamed.slug;
  }

  refreshSeriesPages();
  return json(await seriesDetail(user.id, slug));
});

/** Removes the series. Its books, entries and reads stay, and keep its collection. */
export const DELETE = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const slug = decodeURIComponent((await params).slug);
  const [found] = await db.select({ id: series.id }).from(series).where(eq(series.slug, slug));
  if (!found) throw new ApiError("not_found", "No such series.");
  await db.transaction((tx) => removeSeries(tx, found.id, user.id));
  refreshSeriesPages();
  return new Response(null, { status: 204 });
});
