import { asc } from "drizzle-orm";

import { json, withUser } from "@/lib/api";
import { seriesOnShelf } from "@/lib/books/series-shelf";
import { shelfRows } from "@/lib/books/shelf";
import { db } from "@/lib/db";
import { collections, series } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * The series your shelf touches, for the Series strip on the shelves page
 * (`items`, alphabetical, folded from the rows the web's strip uses), and
 * every series and collection name here (`names`, `collections`), for the
 * series and collection boxes to suggest.
 */
export const GET = withUser(async (_request, { user }) => {
  const [items, names, collectionNames] = await Promise.all([
    shelfRows(user.id, {}).then(seriesOnShelf),
    db.select({ name: series.name }).from(series).orderBy(asc(series.name)),
    db.select({ name: collections.name }).from(collections).orderBy(asc(collections.name)),
  ]);
  return json({ items, names: names.map((s) => s.name), collections: collectionNames.map((c) => c.name) });
});
