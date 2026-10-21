"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { shelveOffShelfBook } from "@/lib/books/off-shelf";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

export async function shelveBook(formData: FormData): Promise<void> {
  const user = await requireUser();
  const workId = String(formData.get("workId") ?? "");
  const shelf = formData.get("shelf");
  if (!isUuid(workId) || !isShelf(shelf)) return;

  const editionId = await shelveOffShelfBook(user.id, workId, shelf);
  if (editionId) {
    revalidatePath("/off-shelf");
    revalidatePath("/");
    revalidatePath(`/edition/${editionId}`);
  }
}
