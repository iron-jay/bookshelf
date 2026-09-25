"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { changeShelf, readAgain, shelveEdition } from "@/lib/books/shelving";
import { cleanTagName, ensureTag, tagEntries, untagEntries } from "@/lib/books/tags";
import { db } from "@/lib/db";
import { editions, entries, reads, tags } from "@/lib/db/schema";
import { isShelf } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

export type FormState = { error: string | null; saved: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The edition id from the form, if it names an edition that exists. */
async function editionFrom(formData: FormData): Promise<string | null> {
  const id = text(formData, "editionId");
  if (!isUuid(id)) return null;
  const [row] = await db.select({ id: editions.id }).from(editions).where(eq(editions.id, id));
  return row?.id ?? null;
}

/**
 * Your entry for an edition. Every change below goes through this, so nothing
 * posted from a form can reach someone else's shelf row.
 */
async function ownEntry(userId: string, editionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.editionId, editionId)));
  return row?.id ?? null;
}

/** A read, only if it belongs to one of your entries. */
async function ownRead(userId: string, readId: string): Promise<{ id: string; editionId: string } | null> {
  if (!isUuid(readId)) return null;
  const [row] = await db
    .select({ id: reads.id, editionId: entries.editionId })
    .from(reads)
    .innerJoin(entries, eq(entries.id, reads.entryId))
    .where(and(eq(reads.id, readId), eq(entries.userId, userId)));
  return row ?? null;
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
  const editionId = await editionFrom(formData);
  const shelf = text(formData, "shelf");
  if (!editionId || !isShelf(shelf)) return;
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return;
  await db.transaction((tx) => changeShelf(tx, entryId, shelf));
  refresh(editionId);
}

/** 1–10, or "" to clear. Whole numbers only: there are no halves (§5). */
export async function setRating(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return;
  const raw = text(formData, "rating");
  const rating = raw === "" ? null : Number(raw);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) return;
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return;
  await db.update(entries).set({ rating }).where(eq(entries.id, entryId));
  refresh(editionId);
}

export async function saveReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return { error: "That edition is no longer here.", saved: false };
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return { error: "Add it to your shelf first.", saved: false };

  // Not trimmed: leading indentation and trailing blank lines can be
  // deliberate in prose. Only a review that is nothing but space is empty.
  const raw = formData.get("review");
  const review = typeof raw === "string" && raw.trim() ? raw : null;
  if (review && review.length > 50_000) {
    return { error: "That review is longer than this server keeps (50,000 characters).", saved: false };
  }

  await db.update(entries).set({ review }).where(eq(entries.id, entryId));
  refresh(editionId);
  return { error: null, saved: true };
}

export async function readAgainAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return;
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return;
  await db.transaction((tx) => readAgain(tx, entryId));
  refresh(editionId);
}

/** "YYYY-MM-DD" that is a real day, "" for none, or "invalid". */
function dateFrom(value: string): string | null | "invalid" {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "invalid" : value;
}

export async function saveRead(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const read = await ownRead(user.id, text(formData, "readId"));
  if (!read) return { error: "That read is no longer here.", saved: false };

  const startedOn = dateFrom(text(formData, "startedOn"));
  const finishedOn = dateFrom(text(formData, "finishedOn"));
  if (startedOn === "invalid" || finishedOn === "invalid") {
    return { error: "Dates should be real days.", saved: false };
  }
  // The same rule as the reads_date_order constraint, said in words rather
  // than surfacing as a 500.
  if (startedOn && finishedOn && finishedOn < startedOn) {
    return { error: "It cannot finish before it started.", saved: false };
  }

  await db.update(reads).set({ startedOn, finishedOn }).where(eq(reads.id, read.id));
  refresh(read.editionId);
  return { error: null, saved: true };
}

export async function deleteRead(formData: FormData): Promise<void> {
  const user = await requireUser();
  const read = await ownRead(user.id, text(formData, "readId"));
  if (!read) return;
  await db.delete(reads).where(eq(reads.id, read.id));
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
  const editionId = await editionFrom(formData);
  const name = cleanTagName(text(formData, "tag"));
  if (!editionId || !name) return;
  const entryId = await ownEntry(user.id, editionId);
  if (!entryId) return;
  await db.transaction(async (tx) => tagEntries(tx, await ensureTag(tx, user.id, name), [entryId]));
  refresh(editionId);
}

export async function removeTag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  const tagId = text(formData, "tagId");
  if (!editionId || !isUuid(tagId)) return;
  const entryId = await ownEntry(user.id, editionId);
  // Your tag only: a tag id from someone else's shelf does nothing here.
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, user.id)));
  if (!entryId || !tag) return;
  await db.transaction((tx) => untagEntries(tx, tag.id, [entryId]));
  refresh(editionId);
}

/**
 * Takes the entry off your shelf, with its rating, review and reads. The
 * edition and its work stay: they are the catalogue, and another account, or
 * you later, may want them.
 */
export async function removeFromShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const editionId = await editionFrom(formData);
  if (!editionId) return;
  const entryId = await ownEntry(user.id, editionId);
  if (entryId) await db.delete(entries).where(eq(entries.id, entryId));
  revalidatePath("/");
  redirect("/");
}
