import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, works, type editionKind } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

import { lookUpCoversOnAdd } from "./covers";
import { plainEditionName } from "./edition-name";
import { shelveEdition } from "./shelving";
import {
  AddBookError,
  fetchOpenLibraryWork,
  insertLocalWork,
  insertOpenLibraryWork,
  type EnsuredWork,
  type WorkFetch,
} from "./works";

export type EditionKind = (typeof editionKind.enumValues)[number];

/** Where the new edition hangs: a work here, one Open Library has, or a new one. */
export type WorkTarget =
  | { kind: "existing"; workId: string }
  | { kind: "openlibrary"; olWorkKey: string }
  | { kind: "new"; title: string; authors: string[] };

export type AddEditionInput = {
  userId: string;
  work: WorkTarget;
  edition: {
    kind: EditionKind;
    /** Blank means the plain "Book" or "Audiobook". */
    name: string | null;
    format: "book" | "audiobook";
    baseEditionId: string | null;
    credit: string | null;
    durationMinutes: number | null;
    language: string | null;
    url: string | null;
    notes: string | null;
  };
  shelf: Shelf;
};

export type AddEditionResult = { workId: string; editionId: string; entryId: string };

/**
 * The typed-in path of the one add flow: a fan translation, another edition of
 * a work already here, or a book Open Library has never heard of. Door A and
 * Door B both land here; Door B just arrives with the work decided.
 *
 * Unlike the Open Library path it always makes a new edition. Two fan
 * translations of the same book are two editions, and the person typing one in
 * is describing a particular text, not asking for a shared default.
 */
export async function addEdition(input: AddEditionInput): Promise<AddEditionResult> {
  const { work: target, edition } = input;

  if (edition.kind === "fan_translation" && !edition.name) {
    throw new AddBookError("A fan translation needs a name, like “Web novel (fan TL)”.");
  }

  // An Open Library work may already be cached; only fetch it if not, and
  // always before the transaction opens.
  let workFetch: WorkFetch | null = null;
  let knownWorkId: string | null = null;
  if (target.kind === "existing") {
    const [row] = await db.select({ id: works.id }).from(works).where(eq(works.id, target.workId));
    if (!row) throw new AddBookError("That work is no longer on this server.");
    knownWorkId = row.id;
  } else if (target.kind === "openlibrary") {
    const [row] = await db
      .select({ id: works.id })
      .from(works)
      .where(eq(works.olWorkKey, target.olWorkKey));
    knownWorkId = row?.id ?? null;
    if (!knownWorkId) workFetch = await fetchOpenLibraryWork(target.olWorkKey);
  }

  const audio = edition.format === "audiobook";

  const outcome = await db.transaction(async (tx) => {
    const work: EnsuredWork = knownWorkId
      ? { id: knownWorkId, created: false }
      : workFetch
        ? await insertOpenLibraryWork(tx, workFetch, input.userId)
        : target.kind === "new"
          ? await insertLocalWork(tx, target, input.userId)
          : unreachable();

    // The base comes from a form, so it is checked rather than believed: an
    // edition of some other book is not what this one translates.
    if (edition.baseEditionId) {
      const [base] = await tx
        .select({ id: editions.id })
        .from(editions)
        .where(and(eq(editions.id, edition.baseEditionId), eq(editions.workId, work.id)));
      if (!base) throw new AddBookError("The base edition belongs to a different work.");
    }

    const [created] = await tx
      .insert(editions)
      .values({
        workId: work.id,
        name: edition.name ?? plainEditionName(edition.format),
        kind: edition.kind,
        format: edition.format,
        baseEditionId: edition.baseEditionId,
        credit: edition.credit,
        durationMinutes: audio ? edition.durationMinutes : null,
        language: edition.language,
        url: edition.url,
        notes: edition.notes,
        source: "local",
        createdBy: input.userId,
      })
      .returning({ id: editions.id });

    const { entryId } = await shelveEdition(tx, input.userId, created.id, input.shelf);
    return { work, editionId: created.id, entryId };
  });

  // Covers, once, after commit. A fan translation gets nothing looked up: it
  // never inherits the work's art and nothing can be guessed for it, so it is
  // its own art (uploaded later) or the placeholder. A work this add created
  // still gets its own cover, which its official editions will show.
  if (outcome.work.created) {
    const title = workFetch?.summary.title ?? (target.kind === "new" ? target.title : null);
    const firstAuthor =
      workFetch?.summary.authors[0] ?? (target.kind === "new" ? target.authors[0] : null) ?? null;
    if (title) {
      await lookUpCoversOnAdd({
        work: {
          id: outcome.work.id,
          title,
          firstAuthor,
          coverId: workFetch ? (workFetch.record.coverId ?? workFetch.summary.coverId) : null,
        },
        workId: outcome.work.id,
        edition: null,
      });
    }
  }

  return { workId: outcome.work.id, editionId: outcome.editionId, entryId: outcome.entryId };
}

function unreachable(): never {
  throw new Error("An existing work target always has a known id");
}
