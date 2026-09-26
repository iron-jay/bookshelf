"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { readWorkFields } from "@/lib/books/edit-fields";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

import type { EditState } from "../../../edit-fields";

/** Works are shared catalogue, like series: any account may correct one. */
export async function saveWorkDetails(_prev: EditState, formData: FormData): Promise<EditState> {
  await requireUser();
  const workId = formData.get("workId");
  if (typeof workId !== "string" || !isUuid(workId)) return { error: "That book is no longer here." };
  const [work] = await db.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, workId));
  if (!work) return { error: "That book is no longer here." };

  const fields = readWorkFields(formData);
  if (!fields.ok) return { error: fields.error };
  await db.update(works).set(fields.set).where(eq(works.id, work.id));

  revalidatePath("/", "layout");
  // Encoded: a slug can be Japanese, and a Location header cannot.
  redirect(`/work/${encodeURIComponent(work.slug)}`);
}
