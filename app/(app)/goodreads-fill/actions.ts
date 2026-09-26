"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  applyGoodreadsFill,
  checkPageData,
  findEditionTarget,
  findGoodreadsTarget,
  listFillCandidates,
  type FillCandidate,
  type GoodreadsTarget,
} from "@/lib/books/goodreads-fill";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

export type Preview =
  | { data: GoodreadsPageData; target: GoodreadsTarget; candidates: null }
  | { data: GoodreadsPageData; target: null; candidates: FillCandidate[] }
  | { error: string };

/**
 * What the page sent, checked, and which book of yours it belongs to: the one
 * with its Goodreads id, or `editionId` once the person has picked one. With
 * neither, the books they could pick from. Changes nothing.
 */
export async function previewGoodreads(raw: unknown, editionId?: unknown): Promise<Preview> {
  const user = await requireUser();
  const data = checkPageData(raw);
  if (!data) return { error: "That did not look like a Goodreads book page." };
  if (typeof editionId === "string") {
    const target = await findEditionTarget(user.id, editionId);
    if (!target) return { error: "That book is not on your shelf." };
    return { data, target, candidates: null };
  }
  const target = await findGoodreadsTarget(user.id, data.goodreadsId);
  if (target) return { data, target, candidates: null };
  return { data, target: null, candidates: await listFillCandidates(user.id, data.title) };
}

export async function applyGoodreads(
  raw: unknown,
  replaceCover: unknown,
  editionId?: unknown,
): Promise<{ filled: string[]; editionId: string } | { error: string }> {
  const user = await requireUser();
  const data = checkPageData(raw);
  if (!data) return { error: "That did not look like a Goodreads book page." };
  const result = await applyGoodreadsFill(
    user.id,
    data,
    replaceCover === true,
    typeof editionId === "string" ? editionId : undefined,
  );
  if ("error" in result) return result;
  revalidatePath("/", "layout");
  return { filled: result.filled, editionId: result.target.editionId };
}
