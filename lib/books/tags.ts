import { and, eq, inArray, notExists } from "drizzle-orm";

import { entryTags, tags } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

import type { Tx } from "./works";

/** Tag names as typed, tidied: trimmed, inner space collapsed, bounded. */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Your tag called `name`, created if you have none. Matched by slug, so
 * "Owned", "owned" and "owned " are the same tag — the first spelling typed is
 * the one kept.
 */
export async function ensureTag(tx: Tx, userId: string, name: string): Promise<string> {
  const clean = cleanTagName(name);
  const slug = slugify(clean);
  const [created] = await tx
    .insert(tags)
    .values({ userId, name: clean, slug })
    .onConflictDoNothing({ target: [tags.userId, tags.slug] })
    .returning({ id: tags.id });
  if (created) return created.id;

  const [existing] = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.slug, slug)));
  return existing.id;
}

export async function tagEntries(tx: Tx, tagId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  await tx
    .insert(entryTags)
    .values(entryIds.map((entryId) => ({ tagId, entryId })))
    .onConflictDoNothing();
}

/**
 * Takes a tag off entries, and deletes the tag once nothing carries it. Tags
 * exist only by being applied, so an unused one is debris — and it would keep
 * turning up in the filter and the suggestions.
 */
export async function untagEntries(tx: Tx, tagId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  await tx
    .delete(entryTags)
    .where(and(eq(entryTags.tagId, tagId), inArray(entryTags.entryId, entryIds)));
  await tx
    .delete(tags)
    .where(
      and(
        eq(tags.id, tagId),
        notExists(tx.select({ one: entryTags.tagId }).from(entryTags).where(eq(entryTags.tagId, tagId))),
      ),
    );
}
