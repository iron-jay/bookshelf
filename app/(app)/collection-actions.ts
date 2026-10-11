"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { setCollection, type CollectionTarget } from "@/lib/books/collections";
import { db } from "@/lib/db";
import { series, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

export type CollectionState = { error: string | null; saved: boolean };

/**
 * Collections are shared catalogue, like series and works: any account may
 * file a series or a book in one. Used from the work page and the series page.
 */
export async function saveCollection(_prev: CollectionState, formData: FormData): Promise<CollectionState> {
  const user = await requireUser();
  const kind = formData.get("targetKind");
  const id = formData.get("targetId");
  const name = formData.get("collection");
  if ((kind !== "series" && kind !== "work") || typeof id !== "string" || !isUuid(id) || typeof name !== "string") {
    return { error: "That book is no longer here.", saved: false };
  }

  const table = kind === "series" ? series : works;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (!row) return { error: "That book is no longer here.", saved: false };

  const target: CollectionTarget = { kind, id: row.id };
  await db.transaction((tx) => setCollection(tx, target, name, user.id));
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
