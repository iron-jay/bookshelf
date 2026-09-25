import { and, desc, eq, isNull } from "drizzle-orm";

import { entries, reads } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

import type { Tx } from "./works";

/** Today where the server is. The date is editable afterwards (brief §5). */
function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Puts an edition on someone's shelf. Landing on Reading opens a read started
 * today, and Finished closes one today — the one click the brief asks for.
 *
 * An edition already on the shelf is left exactly as it is, shelf included:
 * nothing moves entries between shelves except the person doing it.
 */
export async function shelveEdition(
  tx: Tx,
  userId: string,
  editionId: string,
  shelf: Shelf,
): Promise<{ entryId: string; added: boolean }> {
  const [inserted] = await tx
    .insert(entries)
    .values({ userId, editionId, status: shelf })
    .onConflictDoNothing()
    .returning({ id: entries.id });

  if (!inserted) {
    const [existing] = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.editionId, editionId)));
    return { entryId: existing.id, added: false };
  }

  if (shelf === "reading") {
    await tx.insert(reads).values({ entryId: inserted.id, startedOn: today() });
  } else if (shelf === "finished") {
    await tx.insert(reads).values({ entryId: inserted.id, finishedOn: today() });
  }

  return { entryId: inserted.id, added: true };
}

/**
 * Moves an entry to another shelf, with the brief's read rules (§5):
 *
 * - Reading opens a read started today — unless one is already open, since a
 *   book being read has exactly one read in progress.
 * - Finished closes the open read today if there is one, and otherwise records
 *   a read finished today. One click; the date is editable afterwards.
 * - To read and Did not finish touch no reads. An abandoned read stays open
 *   with no finish date, which is exactly what did-not-finish means.
 *
 * Shared by the edition page and, in step 9, the shelf's bulk change.
 */
export async function changeShelf(tx: Tx, entryId: string, shelf: Shelf): Promise<void> {
  // Choosing the shelf it is already on changes nothing — otherwise a second
  // click on Finished would record a second finish.
  const [current] = await tx
    .select({ status: entries.status })
    .from(entries)
    .where(eq(entries.id, entryId));
  if (!current || current.status === shelf) return;

  await tx.update(entries).set({ status: shelf }).where(eq(entries.id, entryId));
  if (shelf !== "reading" && shelf !== "finished") return;

  const [open] = await tx
    .select({ id: reads.id })
    .from(reads)
    .where(and(eq(reads.entryId, entryId), isNull(reads.finishedOn)))
    .orderBy(desc(reads.createdAt))
    .limit(1);

  if (shelf === "reading") {
    if (!open) await tx.insert(reads).values({ entryId, startedOn: today() });
  } else if (open) {
    await tx.update(reads).set({ finishedOn: today() }).where(eq(reads.id, open.id));
  } else {
    await tx.insert(reads).values({ entryId, finishedOn: today() });
  }
}

/** "Read again": a new read started today, and the entry back on Reading. */
export async function readAgain(tx: Tx, entryId: string): Promise<void> {
  await tx.update(entries).set({ status: "reading" }).where(eq(entries.id, entryId));
  await tx.insert(reads).values({ entryId, startedOn: today() });
}
