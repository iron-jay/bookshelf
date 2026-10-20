"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { removeEdition, removeWork } from "@/lib/books/removal";
import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

/**
 * Delete on an edition's page: the whole book unless "Just this edition" was
 * chosen (Jay, 2026-10-20). removeEdition refuses a book's last edition, and
 * then the book goes, as the page said it would.
 */
export async function deleteFromEdition(formData: FormData): Promise<void> {
  await requireUser();
  const editionId = String(formData.get("editionId") ?? "");
  if (!isUuid(editionId)) redirect("/");

  const [row] = await db
    .select({ workId: works.id, slug: works.slug })
    .from(editions)
    .innerJoin(works, eq(works.id, editions.workId))
    .where(eq(editions.id, editionId));
  if (!row) redirect("/");

  if (formData.get("scope") === "edition" && (await removeEdition(editionId))) {
    revalidatePath("/");
    revalidatePath(`/work/${row.slug}`);
    redirect(`/work/${row.slug}`);
  }

  await removeWork(row.workId);
  revalidatePath("/");
  redirect("/");
}
