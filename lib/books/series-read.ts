import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

import { changeShelf, shelveEdition } from "./shelving";

/**
 * Reading a whole run at once (2026-10-17): fifty issues of a comic read
 * over a summer, or a trilogy read years ago, logged in one go instead of
 * fifty trips to fifty edition pages. Every book in the series ends up
 * Finished on the one day given, through the same read rules as a click on
 * Finished, so nothing here is a second way of recording a read.
 *
 * Per work: one already finished is left alone, so running it twice changes
 * nothing; otherwise the entry you have is finished (the one you are reading
 * first, if there are several editions); a work in the series that is not on
 * your shelf goes on it, in its first edition.
 */
export async function readSeries(
  userId: string,
  seriesId: string,
  finishedOn: string,
): Promise<{ finished: number; alreadyFinished: number }> {
  return db.transaction(async (tx) => {
    const members = await tx.select({ id: works.id }).from(works).where(eq(works.seriesId, seriesId));
    if (members.length === 0) return { finished: 0, alreadyFinished: 0 };
    const workIds = members.map((m) => m.id);

    const mine = await tx
      .select({ workId: editions.workId, entryId: entries.id, status: entries.status })
      .from(entries)
      .innerJoin(editions, eq(editions.id, entries.editionId))
      .where(and(eq(entries.userId, userId), inArray(editions.workId, workIds)));
    const firstEditions = await tx
      .select({ workId: editions.workId, id: editions.id })
      .from(editions)
      .where(inArray(editions.workId, workIds))
      .orderBy(asc(editions.createdAt));

    const preference: Readonly<Record<Shelf, number>> = { reading: 0, dnf: 1, tbr: 2, finished: 3 };
    let finished = 0;
    let alreadyFinished = 0;

    for (const workId of workIds) {
      const here = mine.filter((m) => m.workId === workId);
      if (here.some((m) => m.status === "finished")) {
        alreadyFinished++;
        continue;
      }
      if (here.length > 0) {
        const [pick] = [...here].sort((a, b) => preference[a.status] - preference[b.status]);
        await changeShelf(tx, pick.entryId, "finished", finishedOn);
      } else {
        const edition = firstEditions.find((e) => e.workId === workId);
        // Every work has an edition (§2); one that somehow has none is skipped
        // rather than invented.
        if (!edition) continue;
        await shelveEdition(tx, userId, edition.id, "finished", finishedOn);
      }
      finished++;
    }
    return { finished, alreadyFinished };
  });
}
