"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { dateFrom } from "@/lib/books/edit-fields";
import { removeSeries, renameSeries, takeOutOfSeries } from "@/lib/books/series";
import { readSeries } from "@/lib/books/series-read";
import { db } from "@/lib/db";
import { series, works } from "@/lib/db/schema";
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

function revalidateSeries() {
  revalidatePath("/series/[slug]", "page");
  revalidatePath("/collection/[slug]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/edition/[id]", "page");
  revalidatePath("/");
}

export type RenameState = { error: string | null };

/** Renames the series, or joins it to the one of that name (lib/books/series.ts). */
export async function renameSeriesAction(_prev: RenameState, formData: FormData): Promise<RenameState> {
  await requireUser();
  const seriesId = formData.get("seriesId");
  const name = formData.get("name");
  if (typeof seriesId !== "string" || !isUuid(seriesId) || typeof name !== "string") {
    return { error: "That series is gone." };
  }

  const result = await db.transaction((tx) => renameSeries(tx, seriesId, name));
  if ("error" in result) return { error: result.error };

  revalidateSeries();
  redirect(`/series/${result.slug}`);
}

/** Takes every book out and deletes the series. Books, entries and reads stay. */
export async function removeSeriesAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const seriesId = formData.get("seriesId");
  if (typeof seriesId === "string" && isUuid(seriesId)) {
    await db.transaction((tx) => removeSeries(tx, seriesId, user.id));
  }
  revalidateSeries();
  redirect("/");
}

/** One book out of the series; the last one out takes the series with it. */
export async function takeOutOfSeriesAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const seriesId = formData.get("seriesId");
  const workId = formData.get("workId");
  if (typeof seriesId !== "string" || !isUuid(seriesId) || typeof workId !== "string" || !isUuid(workId)) return;

  await db.transaction(async (tx) => {
    const [work] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));
    if (work?.seriesId === seriesId) await takeOutOfSeries(tx, workId, user.id);
  });

  revalidateSeries();
  const [still] = await db.select({ id: series.id }).from(series).where(eq(series.id, seriesId));
  if (!still) redirect("/");
}
