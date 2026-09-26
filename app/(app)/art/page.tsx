import { and, asc, eq, exists } from "drizzle-orm";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";

import { approveCover } from "../cover-actions";
import { Cover } from "../cover";

export const dynamic = "force-dynamic";

type Flagged = {
  kind: "work" | "edition";
  id: string;
  title: string;
  subtitle: string;
  authors: string[];
  coverUrl: string | null;
  href: string;
};

/**
 * Covers applied from a match that was not exact — today, Google Books by
 * title — waiting for someone to say they are right (§4a). Its own page rather
 * than a filter on the shelf, as gameshelf learned.
 */
export default async function ArtPage() {
  const user = await requireUser();

  const onMyShelf = (workOrEditionMatch: ReturnType<typeof eq>) =>
    exists(
      db
        .select({ one: entries.id })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .where(and(eq(entries.userId, user.id), workOrEditionMatch)),
    );

  const flaggedWorks = await db
    .select({ id: works.id, slug: works.slug, title: works.title, authors: works.authors, coverUrl: works.coverUrl })
    .from(works)
    .where(and(eq(works.coverNeedsReview, true), onMyShelf(eq(editions.workId, works.id))))
    .orderBy(asc(works.title));

  const flaggedEditions = await db
    .select({
      id: editions.id,
      name: editions.name,
      title: works.title,
      authors: works.authors,
      coverUrl: editions.coverUrl,
    })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
    .where(eq(editions.coverNeedsReview, true))
    .orderBy(asc(works.title));

  const flagged: Flagged[] = [
    ...flaggedWorks.map((w) => ({
      kind: "work" as const,
      id: w.id,
      title: w.title,
      subtitle: "Work cover",
      authors: w.authors,
      coverUrl: w.coverUrl,
      href: `/work/${w.slug}/cover?from=art`,
    })),
    ...flaggedEditions.map((e) => ({
      kind: "edition" as const,
      id: e.id,
      title: e.title,
      subtitle: e.name,
      authors: e.authors,
      coverUrl: e.coverUrl,
      href: `/edition/${e.id}/cover?from=art`,
    })),
  ];

  return (
    <main className="flex-1 p-6">
      <h1 className="text-xl font-medium">Cover art to review</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        Covers found by title rather than by ISBN, so they may belong to a different book. Approve
        the ones that are right; open the others to upload, paste or remove.
      </p>

      {flagged.length === 0 ? (
        <p className="font-narrow text-ink-dim">Nothing to review.</p>
      ) : (
        <ul className="grid max-w-4xl gap-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {flagged.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2">
              <Cover title={item.title} author={item.authors.join(", ") || null} coverUrl={item.coverUrl} band={null} />
              <div className="font-narrow">
                <p className="truncate text-ink">{item.title}</p>
                <p className="truncate text-ink-dim">{item.subtitle}</p>
              </div>
              <div className="flex items-center gap-3 font-narrow">
                <form action={approveCover}>
                  <input type="hidden" name="targetKind" value={item.kind} />
                  <input type="hidden" name="targetId" value={item.id} />
                  <button type="submit" className="border border-line bg-panel px-3 py-1.5 hover:border-ink-dim">
                    It’s right
                  </button>
                </form>
                <Link href={item.href} className="text-ink-dim underline hover:text-ink">
                  Change
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
