import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { flaggedCovers } from "@/lib/books/art-review";

import { approveCover } from "../cover-actions";
import { Cover } from "../cover";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Covers applied from a match that was not exact — today, Google Books by
 * title — waiting for someone to say they are right (§4a). Its own page rather
 * than a filter on the shelf, as gameshelf learned.
 */
export const metadata: Metadata = { title: "Cover art to review" };

export default async function ArtPage() {
  const user = await requireUser();

  const flagged = (await flaggedCovers(user.id)).map((item) => ({
    ...item,
    href: item.kind === "work" ? `/work/${item.workSlug}/cover?from=art` : `/edition/${item.id}/cover?from=art`,
  }));

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="font-display text-3xl">Cover art to review</h1>
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
              <Cover title={item.title} author={item.authors.join(", ") || null} coverUrl={item.coverUrl} />
              <div className="font-narrow">
                <p className="truncate text-ink">{item.title}</p>
                <p className="truncate text-ink-dim">{item.subtitle}</p>
              </div>
              <div className="flex items-center gap-3 font-narrow">
                <form action={approveCover}>
                  <input type="hidden" name="targetKind" value={item.kind} />
                  <input type="hidden" name="targetId" value={item.id} />
                  <button type="submit" className="btn">
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
