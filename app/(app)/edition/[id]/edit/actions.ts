"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { saveEditionDetails as save } from "@/lib/books/edit-details";
import { isUuid } from "@/lib/uuid";

import type { EditState } from "../../../edit-fields";

/** The book's details and this edition's, saved together or not at all (`lib/books/edit-details.ts`). */
export async function saveEditionDetails(_prev: EditState, formData: FormData): Promise<EditState> {
  const user = await requireUser();
  const editionId = formData.get("editionId");
  if (typeof editionId !== "string" || !isUuid(editionId)) return { error: "That edition is no longer here." };
  const result = await save(user.id, editionId, formData);
  if (!result.ok) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/edition/${editionId}`);
}
