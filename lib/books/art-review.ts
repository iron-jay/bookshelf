import { and, asc, eq, exists } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";

/**
 * Covers applied from a match that was not exact — today, Google Books by
 * title — waiting for someone to say they are right (§4a), on books of yours.
 * Shared by `/art` and the phone's `GET /art`.
 */

export type FlaggedCover = {
  kind: "work" | "edition";
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  coverUrl: string | null;
  /** The work's slug, for a work's cover page. */
  workSlug: string;
};

export async function flaggedCovers(userId: string): Promise<FlaggedCover[]> {
  const onMyShelf = (workOrEditionMatch: ReturnType<typeof eq>) =>
    exists(
      db
        .select({ one: entries.id })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(and(eq(entries.userId, userId), workOrEditionMatch)),
    );

  const flaggedWorks = await db
    .select({ id: works.id, slug: works.slug, title: works.title, authors: works.authors, coverUrl: works.coverUrl })
    .from(works)
    .where(and(eq(works.coverNeedsReview, true), onMyShelf(eq(editions.workId, works.id))))
    .orderBy(asc(works.title));

  const flaggedEditions = await db
    .select({ id: editions.id, name: editions.name, title: works.title, slug: works.slug, authors: works.authors, coverUrl: editions.coverUrl })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, userId)))
    .where(eq(editions.coverNeedsReview, true))
    .orderBy(asc(works.title));

  return [
    ...flaggedWorks.map((w) => ({
      kind: "work" as const,
      id: w.id,
      title: w.title,
      subtitle: "Work cover",
      authors: w.authors,
      coverUrl: w.coverUrl,
      workSlug: w.slug,
    })),
    ...flaggedEditions.map((e) => ({
      kind: "edition" as const,
      id: e.id,
      title: e.title,
      subtitle: e.name,
      authors: e.authors,
      coverUrl: e.coverUrl,
      workSlug: e.slug,
    })),
  ];
}
