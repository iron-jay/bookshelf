"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { addOpenLibraryBook, AddBookError } from "@/lib/books/add";
import { parseIsbn } from "@/lib/isbn";
import { isEditionKey, isWorkKey, OpenLibraryError } from "@/lib/openlibrary";
import { isShelf } from "@/lib/shelves";

import { FORMAT_COOKIE, isFormat } from "./format";

export type AddState = { error: string | null };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Whole hours and minutes, both optional; null when neither adds up to anything. */
function durationFrom(formData: FormData): number | null | "invalid" {
  const hours = text(formData, "hours");
  const minutes = text(formData, "minutes");
  if (!hours && !minutes) return null;

  const h = hours ? Number(hours) : 0;
  const m = minutes ? Number(minutes) : 0;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return "invalid";
  return h * 60 + m || null;
}

export async function addBook(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();

  const olWorkKey = text(formData, "olWorkKey");
  const olEditionKey = text(formData, "edition");
  const format = text(formData, "format");
  const shelf = text(formData, "shelf");

  if (!isWorkKey(olWorkKey) || (olEditionKey && !isEditionKey(olEditionKey))) {
    return { error: "That link is broken. Search for the book again." };
  }
  if (!isFormat(format)) {
    return { error: "Choose Book or Audiobook." };
  }

  const duration = durationFrom(formData);
  if (duration === "invalid") {
    return { error: "Length should be whole hours and minutes, minutes under 60." };
  }

  const isbn = parseIsbn(text(formData, "isbn"));
  const audio = format === "audiobook";

  let result;
  try {
    result = await addOpenLibraryBook({
      userId: user.id,
      olWorkKey,
      olEditionKey: olEditionKey || null,
      format,
      // A missing or unknown shelf is To read, which is what the picker shows
      // by default anyway.
      shelf: isShelf(shelf) ? shelf : "tbr",
      credit: audio ? text(formData, "credit") || null : null,
      durationMinutes: audio ? duration : null,
      isbn: isbn.kind === "isbn" ? isbn.isbn : null,
    });
  } catch (error) {
    if (error instanceof AddBookError) return { error: error.message };
    if (error instanceof OpenLibraryError) {
      return { error: `${error.message}. Nothing was added; try again in a moment.` };
    }
    throw error;
  }

  (await cookies()).set(FORMAT_COOKIE, format, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/");
  redirect(`/?${result.added ? "added" : "already"}=${result.entryId}`);
}
