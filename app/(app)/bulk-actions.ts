"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { changeShelf } from "@/lib/books/shelving";
import { cleanTagName, ensureTag, tagEntries, untagEntries } from "@/lib/books/tags";
import { db } from "@/lib/db";
import { entries, tags } from "@/lib/db/schema";
import { isShelf, SHELF_LABELS } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

export type BulkState = { message: string } | null;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The selected entries that are yours. Ids come from the page, so they are
 * narrowed to your own rows before anything is changed.
 */
async function selectedEntries(userId: string, formData: FormData): Promise<string[]> {
  const ids = formData
    .getAll("entryId")
    .filter((value): value is string => typeof value === "string" && isUuid(value))
    .slice(0, 5000);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.id, ids)));
  return rows.map((row) => row.id);
}

function plural(n: number): string {
  return `${n} ${n === 1 ? "book" : "books"}`;
}

/** Same rules as the edition page, entry by entry, in one transaction. */
export async function changeSelectedShelf(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const shelf = text(formData, "shelf");
  if (!isShelf(shelf)) return { message: "Choose a shelf." };
  const ids = await selectedEntries(user.id, formData);
  if (ids.length === 0) return { message: "Nothing selected." };

  await db.transaction(async (tx) => {
    for (const id of ids) await changeShelf(tx, id, shelf);
  });
  revalidatePath("/");
  return { message: `Moved ${plural(ids.length)} to ${SHELF_LABELS[shelf]}.` };
}

export async function tagSelected(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const name = cleanTagName(text(formData, "tag"));
  if (!name) return { message: "Type a tag to add." };
  const ids = await selectedEntries(user.id, formData);
  if (ids.length === 0) return { message: "Nothing selected." };

  await db.transaction(async (tx) => tagEntries(tx, await ensureTag(tx, user.id, name), ids));
  revalidatePath("/");
  return { message: `Tagged ${plural(ids.length)} ${name}.` };
}

export async function untagSelected(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const slug = text(formData, "untag");
  const [tag] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, user.id), eq(tags.slug, slug)));
  if (!tag) return { message: "Choose a tag to remove." };
  const ids = await selectedEntries(user.id, formData);
  if (ids.length === 0) return { message: "Nothing selected." };

  await db.transaction((tx) => untagEntries(tx, tag.id, ids));
  revalidatePath("/");
  return { message: `Removed ${tag.name} from ${plural(ids.length)}.` };
}
