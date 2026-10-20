"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  deleteRead as deleteOwnRead,
  editionExists,
  ownEntry,
  ownRead,
  ownTag,
  readAgainFor,
  removeEntry,
  REVIEW_MAX,
  reviewFrom,
  tagEntry,
  untagEntry,
  updateEntry,
  updateRead,
} from "@/lib/books/entries";
import { shelveEdition } from "@/lib/books/shelving";
import { db } from "@/lib/db";
import { editions } from "@/lib/db/schema";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

// The rules live in lib/books, shared with the phone's API. These read the
// form, check the row is yours, and refresh the pages that show the result.

export type FormState = { error: string | null; saved: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The edition id from the form, if it names an edition that exists. */
async function editionFrom(formData: FormData): Promise<string | null> {
  const id = text(formData, "editionId");
  return isUuid(id) && (await editionExists(id)) ? id : null;
}

/** Your entry for the form's edition. Nothing posted can reach someone else's row. */
async function entryFrom(userId: string, formData: FormData) {
  const editionId = await editionFrom(formData);
  const entryId = editionId ? await ownEntry(userId, editionId) : null;
  return editionId && entryId ? { editionId, entryId } : null;
}

async function readFrom(userId: string, formData: FormData) {
  const readId = text(formData, "readId");
  return isUuid(readId) ? ownRead(userId, readId) : null;
}

function refresh(editionId: string): void {
  revalidatePath(`/edition/${editionId}`);
  revalidatePath("/");
}

export async function addToShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return;
  const shelf = text(formData, "shelf");
  await db.transaction((tx) => shelveEdition(tx, user.id, editionId, isShelf(shelf) ? shelf : "tbr"));
  refresh(editionId);
}

export async function setShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const shelf = text(formData, "shelf");
  const entry = await entryFrom(user.id, formData);
  if (!entry || !isShelf(shelf)) return;
  // Finishing from the shelves asks for a rating on the way; skipping it sends
  // none and leaves the rating alone.
  const rating = Number(text(formData, "rating"));
  const rated = Number.isInteger(rating) && rating >= 1 && rating <= 10;
  await updateEntry(entry.entryId, rated ? { shelf, rating } : { shelf });
  refresh(entry.editionId);
}

/** 1–10, or "" to clear. Whole numbers only: there are no halves (§5). */
export async function setRating(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = text(formData, "rating");
  const rating = raw === "" ? null : Number(raw);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) return;
  const entry = await entryFrom(user.id, formData);
  if (!entry) return;
  await updateEntry(entry.entryId, { rating });
  refresh(entry.editionId);
}

export async function saveReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return { error: "That edition is no longer here.", saved: false };
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return { error: "Add it to your shelf first.", saved: false };

  const raw = formData.get("review");
  const review = reviewFrom(typeof raw === "string" ? raw : null);
  if (review && review.length > REVIEW_MAX) {
    return { error: "That review is longer than this server keeps (50,000 characters).", saved: false };
  }

  await updateEntry(entryId, { review });
  refresh(editionId);
  return { error: null, saved: true };
}

export async function readAgainAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const entry = await entryFrom(user.id, formData);
  if (!entry) return;
  await readAgainFor(entry.entryId);
  refresh(entry.editionId);
}

/** "YYYY-MM-DD" that is a real day, "" for none, or "invalid". */
export async function saveRead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const read = await readFrom(user.id, formData);
  if (!read) return { error: "That read is no longer here.", saved: false };

  const error = await updateRead(read.id, {
    startedOn: text(formData, "startedOn"),
    finishedOn: text(formData, "finishedOn"),
  });
  if (error) return { error, saved: false };

  refresh(read.editionId);
  return { error: null, saved: true };
}

export async function deleteRead(formData: FormData): Promise<void> {
  const user = await requireUser();
  const read = await readFrom(user.id, formData);
  if (!read) return;
  await deleteOwnRead(read.id);
  refresh(read.editionId);
}

/**
 * Book or audiobook, corrected after the fact — Open Library's format data is
 * often wrong (§5). This edits the edition itself, which every account shares.
 */
export async function setFormat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  const format = text(formData, "format");
  if (!editionId || (format !== "book" && format !== "audiobook")) return;
  // Only someone with it on their shelf can say what it is.
  if (!(await ownEntry(user.id, editionId))) return;
  await db.update(editions).set({ format }).where(eq(editions.id, editionId));
  refresh(editionId);
}

export async function addTag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const entry = await entryFrom(user.id, formData);
  if (!entry) return;
  if (await tagEntry(user.id, entry.entryId, text(formData, "tag"))) refresh(entry.editionId);
}

export async function removeTag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tagId = text(formData, "tagId");
  if (!isUuid(tagId)) return;
  const entry = await entryFrom(user.id, formData);
  // Your tag only: a tag id from someone else's shelf does nothing here.
  const tag = await ownTag(user.id, { id: tagId });
  if (!entry || !tag) return;
  await untagEntry(tag, entry.entryId);
  refresh(entry.editionId);
}

/**
 * Takes the entry off your shelf, with its rating, review and reads. The
 * edition and its work stay: they are the catalogue, and another account, or
 * you later, may want them.
 */
export async function removeFromShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const entry = await entryFrom(user.id, formData);
  if (entry) await removeEntry(entry.entryId);
  revalidatePath("/");
  redirect("/");
}
