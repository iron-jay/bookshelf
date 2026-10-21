"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { removeWork } from "@/lib/books/removal";
import { isUuid } from "@/lib/uuid";

export async function deleteBook(formData: FormData): Promise<void> {
  await requireUser();
  const workId = String(formData.get("workId") ?? "");
  if (isUuid(workId)) await removeWork(workId);
  revalidatePath("/");
  revalidatePath("/off-shelf");
  // Deleting from the list of books not on your shelf goes back to the list.
  redirect(formData.get("from") === "off-shelf" ? "/off-shelf" : "/");
}
