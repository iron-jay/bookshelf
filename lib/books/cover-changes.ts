import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { editions, works } from "@/lib/db/schema";
import { downloadCover, MAX_COVER_BYTES, storeCover } from "@/lib/covers";
import { coverUrlForBook } from "@/lib/hardcover";
import { isUuid } from "@/lib/uuid";

import { candidateUrl } from "./cover-candidates";
import { refreshCover, setCover, type CoverTarget } from "./covers";

/**
 * What a cover page does (§4a), shared by its server actions and the phone's
 * `/covers` routes, so both apply the same rules and say the same things.
 * Covers are shared catalogue: any account may change one.
 */

export type CoverResult = { ok: boolean; message: string };

export const GONE: CoverResult = { ok: false, message: "That book is no longer here." };

/** The work or edition named, if it exists. */
export async function coverTarget(kind: string, id: string): Promise<CoverTarget | null> {
  if ((kind !== "work" && kind !== "edition") || !isUuid(id)) return null;
  const table = kind === "work" ? works : editions;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return row ? { kind, id: row.id } : null;
}

export async function uploadCoverBytes(target: CoverTarget, bytes: Uint8Array): Promise<CoverResult> {
  if (bytes.byteLength === 0) return { ok: false, message: "Choose an image first." };
  if (bytes.byteLength > MAX_COVER_BYTES) return { ok: false, message: "That image is larger than 8 MB." };
  const stored = await storeCover(bytes);
  if (!stored.ok) return { ok: false, message: stored.reason };
  // Chosen by a person, so nothing to review.
  await setCover(target, stored.path, "upload", false);
  return { ok: true, message: "Cover uploaded." };
}

/**
 * Downloaded once and stored, never hot-linked. The server fetches the
 * address it is given; on a self-hosted app the person asking is the owner,
 * and only an actual image is ever kept.
 */
export async function coverFromAddress(target: CoverTarget, address: string): Promise<CoverResult> {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return { ok: false, message: "Paste the image's address, starting with https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Paste the image's address, starting with https://." };
  }
  const stored = await downloadCover(url.toString());
  if (!stored.ok) return { ok: false, message: stored.reason };
  await setCover(target, stored.path, "url", false);
  return { ok: true, message: "Cover saved from that address." };
}

export async function lookUpAgain(target: CoverTarget): Promise<CoverResult> {
  return (await refreshCover(target)) === "found"
    ? { ok: true, message: "Found one and applied it." }
    : { ok: false, message: "Nothing found; the cover is unchanged." };
}

/** Back to the typeset placeholder — or, for an edition, the work's cover. */
export async function removeCoverOf(target: CoverTarget): Promise<CoverResult> {
  await setCover(target, null, null, false);
  return { ok: true, message: "Cover removed." };
}

/** Accepts a flagged cover as right. */
export async function approveCoverOf(target: CoverTarget): Promise<void> {
  const table = target.kind === "work" ? works : editions;
  await db.update(table).set({ coverNeedsReview: false }).where(eq(table.id, target.id));
}

/**
 * Applies a chosen candidate. The caller sends which source and which id; the
 * address downloaded is built here from those, so nothing sent from a page or
 * the phone can make the server fetch anywhere else. Chosen by a person: no
 * review.
 */
export async function applyCandidate(target: CoverTarget, source: string, ref: string): Promise<CoverResult> {
  // Hardcover's address comes from Hardcover, asked by id: never supplied.
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
  return { ok: true, message: "Cover applied." };
}
