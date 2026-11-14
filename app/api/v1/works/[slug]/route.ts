import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { refreshSeriesPages } from "@/lib/api/refresh";
import { setCollection, type CollectionTarget } from "@/lib/books/collections";
import { workDetail } from "@/lib/books/read";
import { removeWork } from "@/lib/books/removal";
import { parsePosition, saveWorkSeries } from "@/lib/books/series";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** A work, its editions (with your entry on each), its series and collection. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await workDetail(user.id, (await params).slug);
  if (!detail) throw new ApiError("not_found", "No such work.");
  return json(detail);
});

/**
 * The book page's series and collection boxes. `{ series: { name, position,
 * taken? } }` puts it in a series ("" takes it out); a number another book
 * there already has is not saved but answered as `{ taken: { title, series,
 * position } }`, to send again with `taken: "shift"` (it and the rest move up
 * one) or `"keep"` (both at that number). Comic Vine runs never ask.
 * `{ collection }` sets its collection, the series' for a book in one ("" takes
 * it out). Otherwise answers `{ taken: null, work }`.
 */
export const PATCH = withUser<{ slug: string }>(async (request, { params, user }) => {
  const slug = (await params).slug;
  const body = await readObject(request);
  const [work] = await db.select({ id: works.id, seriesId: works.seriesId }).from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such work.");

  let seriesChange: { name: string; position: number | null; taken: "shift" | "keep" | null } | null = null;
  if (body.series !== undefined) {
    const raw = body.series === null ? { name: "" } : body.series;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ApiError("invalid", "series is { name, position }.", { fields: { series: "Must be an object." } });
    }
    const given = raw as Record<string, unknown>;
    const name = typeof given.name === "string" ? given.name.trim().slice(0, 200) : "";
    const position =
      given.position === null || given.position === undefined || given.position === ""
        ? null
        : parsePosition(String(given.position));
    if (position === "invalid") {
      throw new ApiError("invalid", "Position should be a number like 8 or 2.5.", { fields: { position: "Not a number." } });
    }
    const taken = given.taken === "shift" || given.taken === "keep" ? given.taken : null;
    seriesChange = { name, position, taken };
  }
  if (body.collection !== undefined && typeof body.collection !== "string") {
    throw new ApiError("invalid", "collection is text.", { fields: { collection: "Must be text." } });
  }
  if (!seriesChange && body.collection === undefined) {
    throw new ApiError("invalid", "Nothing to change.", { fields: { series: "Give series or collection." } });
  }

  if (seriesChange) {
    const { name, position, taken } = seriesChange;
    const asked = await db.transaction((tx) => saveWorkSeries(tx, work.id, name, position, taken, user.id));
    if (asked) return json({ taken: asked, work: null });
  }
  if (typeof body.collection === "string") {
    const name = body.collection;
    // In a series, the series carries the collection for all its books.
    const [now] = await db.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, work.id));
    const target: CollectionTarget = now?.seriesId ? { kind: "series", id: now.seriesId } : { kind: "work", id: work.id };
    await db.transaction((tx) => setCollection(tx, target, name, user.id));
  }

  refreshSeriesPages();
  return json({ taken: null, work: await workDetail(user.id, slug) });
});

/** Deletes the book, its editions, and everyone's entries and reads on them, as the web's Delete. 204. */
export const DELETE = withUser<{ slug: string }>(async (_request, { params }) => {
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, (await params).slug));
  if (!work) throw new ApiError("not_found", "No such work.");
  await removeWork(work.id);
  revalidatePath("/");
  revalidatePath("/off-shelf");
  return new Response(null, { status: 204 });
});
