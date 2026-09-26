"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { readEditionFields, readWorkFields } from "@/lib/books/edit-fields";
import { db } from "@/lib/db";
import { editions, entries, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import type { EditState } from "../../../edit-fields";

/**
 * The book's details and this edition's, saved together or not at all. The
 * edition must be on your shelf, as before: editions are only corrected by
 * someone holding one.
 */
export async function saveEditionDetails(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireUser();
  const editionId = formData.get("editionId");
  if (typeof editionId !== "string" || !isUuid(editionId)) return { error: "That edition is no longer here." };
  const [edition] = await db
    .select({ id: editions.id, workId: editions.workId })
    .from(editions)
    .innerJoin(entries, and(eq(entries.editionId, editions.id), eq(entries.userId, user.id)))
    .where(eq(editions.id, editionId));
  if (!edition) return { error: "Add it to your shelf first." };

  const work = readWorkFields(formData);
  if (!work.ok) return { error: work.error };
  const own = await readEditionFields(formData, edition);
  if (!own.ok) return { error: own.error };

  await db.transaction(async (tx) => {
    await tx.update(works).set(work.set).where(eq(works.id, edition.workId));
    await tx.update(editions).set(own.set).where(eq(editions.id, edition.id));
  });

  revalidatePath("/", "layout");
  redirect(`/edition/${edition.id}`);
}
