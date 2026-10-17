"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { dateFrom } from "@/lib/books/edit-fields";
import { readSeries } from "@/lib/books/series-read";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

export type SeriesReadState = { error: string | null; done: string | null };

/** Every book in the series to Finished, on the day given (lib/books/series-read.ts). */
export async function finishSeries(_prev: SeriesReadState, formData: FormData): Promise<SeriesReadState> {
  const user = await requireUser();
  const seriesId = formData.get("seriesId");
  const raw = formData.get("finishedOn");
  const finishedOn = dateFrom(typeof raw === "string" ? raw.trim() : "");

  if (typeof seriesId !== "string" || !isUuid(seriesId)) return { error: "That series is gone.", done: null };
  if (!finishedOn || finishedOn === "invalid") return { error: "Give the day you finished, as a real date.", done: null };

  const [found] = await db.select({ slug: series.slug }).from(series).where(eq(series.id, seriesId));
  if (!found) return { error: "That series is gone.", done: null };

  const { finished } = await readSeries(user.id, seriesId, finishedOn);
  revalidatePath(`/series/${found.slug}`);
  revalidatePath("/");
  return {
    error: null,
    done: finished === 0 ? "Every book in it was already finished." : `${finished} ${finished === 1 ? "book" : "books"} marked finished.`,
  };
}
