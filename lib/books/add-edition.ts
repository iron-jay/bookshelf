import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, works, type editionKind } from "@/lib/db/schema";
import type { Shelf } from "@/lib/shelves";

import { lookUpCoversOnAdd } from "./covers";
import { applyBookDraft, type BookDraft } from "./draft";
import { plainEditionName } from "./edition-name";
import { shelveEdition } from "./shelving";
import { AddBookError, insertLocalWork, type EnsuredWork } from "./works";

export type EditionKind = (typeof editionKind.enumValues)[number];

/** Where the new edition hangs: a work here, or a new one typed in. */
export type WorkTarget =
  | { kind: "existing"; workId: string }
  /** `draft` is the rest of the form's details: year, summary, series. */
  | { kind: "new"; title: string; authors: string[]; draft?: BookDraft };

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
 * The typed-in path of the one add flow: another edition of a work already
 * here, or a book Open Library has never heard of. Door A and Door B both land
 * here; Door B just arrives with the work decided.
 *
 * Unlike the Open Library path it always makes a new edition: the person
 * typing one in is describing a particular text, not asking for a shared
 * default.
 */
export async function addEdition(input: AddEditionInput): Promise<AddEditionResult> {
  const { work: target, edition } = input;

  let knownWorkId: string | null = null;
  if (target.kind === "existing") {
    const [row] = await db.select({ id: works.id }).from(works).where(eq(works.id, target.workId));
    if (!row) throw new AddBookError("That work is no longer on this server.");
    knownWorkId = row.id;
  }

  const audio = edition.format === "audiobook";

  const outcome = await db.transaction(async (tx) => {
    const work: EnsuredWork = knownWorkId
      ? { id: knownWorkId, created: false }
      : target.kind === "new"
        ? await insertLocalWork(tx, target, input.userId)
        : unreachable();
    if (work.created && target.kind === "new" && target.draft) {
      await applyBookDraft(tx, work.id, target.draft, input.userId);
    }

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

  // Covers, once, after commit, for a work this add created: its editions
  // show the work's cover until they have their own.
  if (outcome.work.created && target.kind === "new") {
    await lookUpCoversOnAdd({
      work: { id: outcome.work.id, title: target.title, firstAuthor: target.authors[0] ?? null, coverId: null },
      workId: outcome.work.id,
      edition: null,
    });
  }

  return { workId: outcome.work.id, editionId: outcome.editionId, entryId: outcome.entryId };
}

function unreachable(): never {
  throw new Error("An existing work target always has a known id");
}
