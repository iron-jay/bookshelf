"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { candidateUrl, candidatesFor, searchCandidates, type CoverCandidate } from "@/lib/books/cover-candidates";
import { refreshCover, setCover, type CoverTarget } from "@/lib/books/covers";
import { downloadCover, MAX_COVER_BYTES, storeCover } from "@/lib/covers";
import { coverUrlForBook } from "@/lib/hardcover";
import { db } from "@/lib/db";
import { COMMUNITY_EDITION_KINDS, editions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

export type CoverState = { ok: boolean; message: string } | null;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The work or edition named by the form, if it exists. Covers are shared catalogue. */
async function targetFrom(formData: FormData): Promise<CoverTarget | null> {
  const kind = text(formData, "targetKind");
  const id = text(formData, "targetId");
  if ((kind !== "work" && kind !== "edition") || !isUuid(id)) return null;
  const table = kind === "work" ? works : editions;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return row ? { kind, id: row.id } : null;
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

const GONE: CoverState = { ok: false, message: "That book is no longer here." };

export async function uploadCover(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image first." };
  if (file.size > MAX_COVER_BYTES) return { ok: false, message: "That image is larger than 8 MB." };

  const stored = await storeCover(new Uint8Array(await file.arrayBuffer()));
  if (!stored.ok) return { ok: false, message: stored.reason };
  // Chosen by a person, so nothing to review.
  await setCover(target, stored.path, "upload", false);
  finish(formData);
  return { ok: true, message: "Cover uploaded." };
}

/**
 * Downloaded once and stored, never hot-linked (§4a). The server fetches the
 * address it is given; on a self-hosted app the person asking is the owner,
 * and only an actual image is ever kept.
 */
export async function coverFromUrl(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;

  let url: URL;
  try {
    url = new URL(text(formData, "url"));
  } catch {
    return { ok: false, message: "Paste the image's address, starting with https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Paste the image's address, starting with https://." };
  }

  const stored = await downloadCover(url.toString());
  if (!stored.ok) return { ok: false, message: stored.reason };
  await setCover(target, stored.path, "url", false);
  finish(formData);
  return { ok: true, message: "Cover saved from that address." };
}

export async function lookUpCoverAgain(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;

  const result = await refreshCover(target);
  if (result === "found") {
    finish(formData);
    return { ok: true, message: "Found one and applied it." };
  }
  refresh();
  if (result === "not-for-fan-translations") {
    return { ok: false, message: "Nothing is looked up for a fan translation: upload its art or keep the placeholder." };
  }
  return { ok: false, message: "Nothing found; the cover is unchanged." };
}

/** Back to the typeset placeholder — or, for an edition, the work's cover. */
export async function removeCover(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  await setCover(target, null, null, false);
  finish(formData);
  return { ok: true, message: "Cover removed." };
}

/** Accepts a flagged cover as right. Used on /art and on the page itself. */
export async function approveCover(formData: FormData): Promise<void> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return;
  const table = target.kind === "work" ? works : editions;
  await db.update(table).set({ coverNeedsReview: false }).where(eq(table.id, target.id));
  finish(formData);
}

/**
 * Fan translations are refused the picker: every candidate is some official
 * book's art, which is exactly what a fan translation must not wear (§4a —
 * "looks correct and is wrong"). Upload and paste stay open to them.
 */
async function isFanTranslation(target: CoverTarget): Promise<boolean> {
  if (target.kind !== "edition") return false;
  const [row] = await db.select({ kind: editions.kind }).from(editions).where(eq(editions.id, target.id));
  return Boolean(row && (COMMUNITY_EDITION_KINDS as readonly string[]).includes(row.kind));
}

export async function listCoverCandidates(kind: string, id: string): Promise<CoverCandidate[]> {
  await requireUser();
  const form = new FormData();
  form.set("targetKind", kind);
  form.set("targetId", id);
  const target = await targetFrom(form);
  if (!target || (await isFanTranslation(target))) return [];
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

/**
 * Applies a chosen candidate. The page sends which source and which id; the
 * address downloaded is built here from those, so nothing sent from a page
 * can make the server fetch anywhere else. Chosen by a person: no review.
 */
export async function applyCoverCandidate(_prev: CoverState, formData: FormData): Promise<CoverState> {
  await requireUser();
  const target = await targetFrom(formData);
  if (!target) return GONE;
  if (await isFanTranslation(target)) {
    return { ok: false, message: "A fan translation takes its own art: upload it or paste its address." };
  }
  const source = text(formData, "source");
  const ref = text(formData, "ref");
  // Hardcover's address comes from Hardcover, asked by id: the page never
  // supplies it.
  const url =
    source === "hardcover"
      ? /^\d{1,10}$/.test(ref)
        ? await coverUrlForBook(Number(ref))
        : null
      : candidateUrl(source, ref);
  if (!url || (source !== "openlibrary" && source !== "googlebooks" && source !== "hardcover")) {
    return { ok: false, message: "Choose a cover first." };
  }

  const stored = await downloadCover(url);
  if (!stored.ok) return { ok: false, message: `${stored.reason} Try another.` };
  await setCover(target, stored.path, source, false);
  finish(formData);
  return { ok: true, message: "Cover applied." };
}
