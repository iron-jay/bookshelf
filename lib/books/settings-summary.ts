import { and, asc, count, countDistinct, eq, isNotNull, isNull } from "drizzle-orm";

import { offShelfBooks } from "@/lib/books/off-shelf";
import { db } from "@/lib/db";
import { editions, entries, entryCards, works } from "@/lib/db/schema";
import { hardcoverEnabled } from "@/lib/hardcover";

/** The counts Settings shows beside each of its sections, shared with the phone's `GET /settings`. */
export async function settingsSummary(userId: string) {
  const hardcoverOn = hardcoverEnabled();
  const [hardcoverPending] = hardcoverOn
    ? await db
        .select({ n: countDistinct(works.id) })
        .from(entries)
        .innerJoin(editions, eq(editions.id, entries.editionId))
        .innerJoin(works, eq(works.id, editions.workId))
        .where(and(eq(entries.userId, userId), eq(works.source, "local"), isNull(works.hardcoverId)))
    : [{ n: 0 }];

  const offShelf = (await offShelfBooks(userId)).length;
  const [entryTotal] = await db.select({ n: count() }).from(entries).where(eq(entries.userId, userId));

  // entry_cards already says whether the cover on screen for each entry is
  // flagged, whichever row it belongs to.
  const [flagged] = await db
    .select({ n: count() })
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), eq(entryCards.coverNeedsReview, true)));
  const [placeholders] = await db
    .select({ n: count() })
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), isNull(entryCards.coverUrl)));

  // Goodreads rows that matched nothing became local works (§5). Read from the
  // data rather than kept from the run, so the list survives a closed tab or
  // a restart: an edition with a Goodreads id whose work is local is one.
  const unmatched = await db
    .select({ editionId: editions.id, title: works.title, slug: works.slug, authors: works.authors })
    .from(entries)
    .innerJoin(editions, eq(editions.id, entries.editionId))
    .innerJoin(works, eq(works.id, editions.workId))
    .where(
      and(
        eq(entries.userId, userId),
        isNotNull(editions.goodreadsBookId),
        eq(works.source, "local"),
        // Found by ISBN but given a work of its own (Open Library's was a
        // catch-all): matched, so not listed.
        isNull(editions.olEditionKey),
        // Filled in from Hardcover: matched there, so not listed either.
        isNull(works.hardcoverId),
      ),
    )
    .orderBy(asc(works.title));

  return {
    hardcoverOn,
    hardcoverPending: hardcoverPending.n,
    offShelf,
    entries: entryTotal.n,
    flaggedCovers: flagged.n,
    placeholders: placeholders.n,
    unmatched,
  };
}
