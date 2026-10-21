import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { collections, editions, series, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

/*
 * What a book's tab says. The root layout adds " · bookshelf", so these are
 * only the part before it, and a miss falls back to the layout's bare name
 * while the page itself answers with its 404.
 *
 * Each checks the session first: metadata resolves beside the layout rather
 * than after it, and a title is as much a book's name as the page is.
 */

function titled(name: string | undefined, prefix?: string): Metadata {
  if (!name) return {};
  return { title: prefix ? `${prefix} ${name}` : name };
}

export async function workTitle(slug: string, prefix?: string): Promise<Metadata> {
  await requireUser();
  const [row] = await db
    .select({ title: works.title })
    .from(works)
    .where(eq(works.slug, decodeURIComponent(slug)));
  return titled(row?.title, prefix);
}

/** An edition's tab names the book: the edition's own name is "Paperback, 1990". */
export async function editionTitle(id: string, prefix?: string): Promise<Metadata> {
  await requireUser();
  if (!isUuid(id)) return {};
  const [row] = await db
    .select({ title: works.title })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, id));
  return titled(row?.title, prefix);
}

export async function seriesTitle(slug: string): Promise<Metadata> {
  await requireUser();
  const [row] = await db
    .select({ name: series.name })
    .from(series)
    .where(eq(series.slug, decodeURIComponent(slug)));
  return titled(row?.name);
}

export async function collectionTitle(slug: string): Promise<Metadata> {
  await requireUser();
  const [row] = await db
    .select({ name: collections.name })
    .from(collections)
    .where(eq(collections.slug, decodeURIComponent(slug)));
  return titled(row?.name);
}
