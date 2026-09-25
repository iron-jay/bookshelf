import { desc, eq } from "drizzle-orm";
import Image from "next/image";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryCards } from "@/lib/db/schema";
import { SHELF_LABELS } from "@/lib/shelves";

export const dynamic = "force-dynamic";

/**
 * A stand-in until the shelf exists (build step 5): a plain list off
 * entry_cards, so an add has somewhere to land and its cover — or the lack of
 * one — can be seen. Replaced wholesale by the grid, placeholders and filters.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; already?: string }>;
}) {
  const user = await requireUser();
  const { added, already } = await searchParams;

  const rows = await db
    .select()
    .from(entryCards)
    .where(eq(entryCards.userId, user.id))
    .orderBy(desc(entryCards.addedAt));

  const landed = rows.find((row) => row.entryId === (added ?? already));

  return (
    <main className="flex-1 p-6">
      {landed ? (
        <p role="status" className="mb-6 border-l-2 border-ink-dim pl-3 font-narrow">
          {added ? "Added" : "Already on your shelf"}: {landed.workTitle}, {landed.editionName}.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="font-narrow text-ink-dim">Nothing on your shelf yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.entryId} className="flex items-center gap-4 border-b border-line py-3">
              <div className="h-18 w-12 shrink-0 bg-panel">
                {row.coverUrl ? (
                  <Image
                    src={row.coverUrl}
                    alt=""
                    width={48}
                    height={72}
                    className="h-18 w-12 object-cover"
                    // Served by the session-checked /covers route, which the
                    // image optimiser cannot fetch: it carries no cookie.
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate">{row.workTitle}</p>
                <p className="truncate font-narrow">{(row.authors ?? []).join(", ")}</p>
                <p className="font-narrow text-ink-dim">
                  {[
                    row.editionName,
                    row.format === "audiobook" ? "Audiobook" : "Book",
                    row.status ? SHELF_LABELS[row.status] : null,
                    row.coverUrl ? null : "no cover",
                    row.coverNeedsReview ? "cover needs review" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
