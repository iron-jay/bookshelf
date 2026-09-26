"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { applyGoodreadsFill, checkPageData, findGoodreadsTarget, type GoodreadsTarget } from "@/lib/books/goodreads-fill";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

export type Preview = { data: GoodreadsPageData; target: GoodreadsTarget | null } | { error: string };

/** What the page sent, checked, and which book of yours it belongs to. Changes nothing. */
export async function previewGoodreads(raw: unknown): Promise<Preview> {
  const user = await requireUser();
  const data = checkPageData(raw);
  if (!data) return { error: "That did not look like a Goodreads book page." };
  return { data, target: await findGoodreadsTarget(user.id, data.goodreadsId) };
}

export async function applyGoodreads(
  raw: unknown,
  replaceCover: unknown,
): Promise<{ filled: string[]; editionId: string } | { error: string }> {
  const user = await requireUser();
  const data = checkPageData(raw);
  if (!data) return { error: "That did not look like a Goodreads book page." };
  const result = await applyGoodreadsFill(user.id, data, replaceCover === true);
  if ("error" in result) return result;
  revalidatePath("/", "layout");
  return { filled: result.filled, editionId: result.target.editionId };
}
