import { and, eq } from "drizzle-orm";

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
