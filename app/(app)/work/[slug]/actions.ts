"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { parsePosition, setWorkSeries, shiftUpFrom, takenNumber, type TakenNumber } from "@/lib/books/series";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";

export type SeriesState = { error: string | null; saved: boolean; taken?: TakenNumber };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Series are shared catalogue, like works: any account may file a work in
 * one. Typing an existing series' name joins it; a new name creates it; a
 * blank name takes the work out of whatever series it was in.
 */
export async function saveSeries(_prev: SeriesState, formData: FormData): Promise<SeriesState> {
  const user = await requireUser();
  const workId = text(formData, "workId");
  if (!isUuid(workId)) return { error: "That work is no longer here.", saved: false };

  const [work] = await db.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, workId));
  if (!work) return { error: "That work is no longer here.", saved: false };

  const name = text(formData, "series").slice(0, 200);
  const position = parsePosition(text(formData, "position"));
  if (position === "invalid") {
    return { error: "Position should be a number like 8 or 2.5.", saved: false };
  }

  // A number another book has is asked about first: move it and the books
  // after it up one, or keep both there (Jay, 2026-10-21).
  const choice = text(formData, "taken");
  const result = await db.transaction(async (tx): Promise<TakenNumber | null> => {
    if (name && position !== null && choice !== "keep") {
      const taken = await takenNumber(tx, name, position, work.id);
      if (taken && choice !== "shift") return taken;
      await setWorkSeries(tx, work.id, name, position, user.id);
      if (taken) await shiftUpFrom(tx, work.id, position);
      return null;
    }
    await setWorkSeries(tx, work.id, name, name ? position : null, user.id);
    return null;
  });
  if (result) return { error: null, saved: false, taken: result };

  revalidatePath(`/work/${work.slug}`);
  // Set from an edition's page as well, and listed on the series pages.
  revalidatePath("/edition/[id]", "page");
  revalidatePath("/series/[slug]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/");
  return { error: null, saved: true };
}
