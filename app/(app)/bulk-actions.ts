"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { moveToShelf, putInSeries, tagAll, untagAll } from "@/lib/books/bulk";

/** The wall's select mode; the rules are `lib/books/bulk.ts`, shared with the API. */

export type BulkState = { message: string } | null;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function changeSelectedShelf(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await moveToShelf(user.id, formData.getAll("entryId"), text(formData, "shelf").trim());
  if (result.ok) revalidatePath("/");
  return { message: result.message };
}

export async function tagSelected(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await tagAll(user.id, formData.getAll("entryId"), text(formData, "tag"));
  if (result.ok) revalidatePath("/");
  return { message: result.message };
}

export async function untagSelected(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await untagAll(user.id, formData.getAll("entryId"), text(formData, "untag"));
  if (result.ok) revalidatePath("/");
  return { message: result.message };
}

export async function seriesSelected(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await putInSeries(user.id, formData.getAll("entryId"), text(formData, "series"));
  if (result.ok) revalidatePath("/", "layout");
  return { message: result.message };
}
