import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import {
  getWorkRecord,
  getWorkSummary,
  type OlWorkRecord,
  type OlWorkSummary,
} from "@/lib/openlibrary";
import { slugify } from "@/lib/slug";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A failure worth showing on the form as it is. */
export class AddBookError extends Error {}

export type WorkFetch = { olWorkKey: string; record: OlWorkRecord; summary: OlWorkSummary };

export type EnsuredWork = { id: string; created: boolean };

/**
 * The raw record (stored in ol_payload) and the author names, which only
 * search carries. Two queued requests; call it before a transaction opens.
 */
export async function fetchOpenLibraryWork(olWorkKey: string): Promise<WorkFetch> {
  const record = await getWorkRecord(olWorkKey);
  const summary = record ? await getWorkSummary(olWorkKey) : null;
  if (!record || !summary) throw new AddBookError("Open Library no longer has that work.");
  return { olWorkKey, record, summary };
}

export async function insertOpenLibraryWork(
  tx: Tx,
  fetched: WorkFetch,
  userId: string,
): Promise<EnsuredWork> {
  const { olWorkKey, record, summary } = fetched;
  const base = slugify(summary.title);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));

  const [created] = await tx
    .insert(works)
    .values({
      olWorkKey,
      // Titles repeat across books far more than game titles do. The Open
      // Library key is the tiebreak that cannot collide.
      slug: clash ? `${base}-${olWorkKey.toLowerCase()}` : base,
      title: summary.title,
      subtitle: summary.subtitle,
      authors: summary.authors,
      authorSort: authorSortFor(summary.authors[0]),
      olAuthorKeys: record.authorKeys,
      summary: record.summary,
      firstPublishedYear: summary.firstPublishedYear,
      olPayload: record.payload,
      olSyncedAt: new Date(),
      source: "openlibrary",
      createdBy: userId,
    })
    // Two adds of the same new work at once: the second finds the first's row.
    .onConflictDoNothing({ target: works.olWorkKey })
    .returning({ id: works.id });

  if (created) return { id: created.id, created: true };

  const [existing] = await tx
    .select({ id: works.id })
    .from(works)
    .where(eq(works.olWorkKey, olWorkKey));
  return { id: existing.id, created: false };
}

/**
 * A work Open Library has never heard of: a web novel, a zine, something out
 * of print. `source = 'local'`, so no refresh will ever overwrite it.
 */
export async function insertLocalWork(
  tx: Tx,
  work: { title: string; authors: string[] },
  userId: string,
): Promise<EnsuredWork> {
  const id = randomUUID();
  const base = slugify(work.title);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));

  await tx.insert(works).values({
    id,
    // No upstream key to break a tie with, so the row's own id does it.
    slug: clash ? `${base}-${id.slice(0, 8)}` : base,
    title: work.title,
    authors: work.authors,
    authorSort: authorSortFor(work.authors[0]),
    source: "local",
    createdBy: userId,
  });

  return { id, created: true };
}
