"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { candidatesFor, searchCandidates, type CoverCandidate } from "@/lib/books/cover-candidates";
import {
  applyCandidate,
  approveCoverOf,
  coverFromAddress,
  coverTarget,
  GONE,
  lookUpAgain,
  removeCoverOf,
  uploadCoverBytes,
} from "@/lib/books/cover-changes";
import type { CoverTarget } from "@/lib/books/covers";

// The rules live in lib/books/cover-changes.ts, shared with the phone's API.
// These read the form, and send the person back where they came from.

export type CoverState = { ok: boolean; message: string } | null;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function targetFrom(formData: FormData): Promise<CoverTarget | null> {
  return coverTarget(text(formData, "targetKind"), text(formData, "targetId"));
}

/** Covers show on every page and the shelf, so everything is refreshed. */
function refresh(): void {
  revalidatePath("/", "layout");
}

/**
 * Where a cover page came from: the book's page, or /art. Only those shapes,
 * so a posted form cannot turn this into a redirect anywhere else. Slugs
 * arrive percent-encoded — a Location header cannot carry a Japanese title —
 * so anything outside ASCII is refused rather than sent.
 */
const BACK = /^\/(work\/[A-Za-z0-9%._~-]+|edition\/[0-9a-f-]{36}|art)$/;

/**
 * A change made on a cover page is done once it is applied: back to the page
 * the person came from, where the new cover shows. Without a back address
 * (/art's own "It's right") they stay where they are.
 */
function finish(formData: FormData): void {
  refresh();
  const back = text(formData, "back");
  if (BACK.test(back)) redirect(back);
}

export async function uploadCover(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image first." };
  const result = await uploadCoverBytes(target, new Uint8Array(await file.arrayBuffer()));
  if (result.ok) finish(formData);
  return result;
}

export async function coverFromUrl(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  const result = await coverFromAddress(target, text(formData, "url"));
  if (result.ok) finish(formData);
  return result;
}

export async function lookUpCoverAgain(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  const result = await lookUpAgain(target);
  if (result.ok) finish(formData);
  else refresh();
  return result;
}

export async function removeCover(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  const result = await removeCoverOf(target);
  finish(formData);
  return result;
}

/** Accepts a flagged cover as right. Used on /art and on the page itself. */
export async function approveCover(formData: FormData): Promise<void> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return;
  await approveCoverOf(target);
  finish(formData);
}

export async function listCoverCandidates(kind: string, id: string): Promise<CoverCandidate[]> {
  await requireUser();
  const target = await coverTarget(kind, id);
  if (!target) return [];
  try {
    return await candidatesFor(target);
  } catch {
    // Open Library unreachable: an empty grid, and the search box still tries.
    return [];
  }
}

export async function searchCoverCandidates(term: unknown): Promise<CoverCandidate[]> {
  await requireUser();
  if (typeof term !== "string") return [];
  try {
    return await searchCandidates(term);
  } catch {
    return [];
  }
}

export async function applyCoverCandidate(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  const result = await applyCandidate(target, text(formData, "source"), text(formData, "ref"));
  if (result.ok) finish(formData);
  return result;
}
