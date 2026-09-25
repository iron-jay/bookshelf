import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { series, works } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

import type { Tx } from "./works";

/**
 * "8", "2.5", "0" — or null for blank. Positions are numeric because novellas
 * sit between books (§2); the column holds two decimal places.
 */
export function parsePosition(value: string): number | null | "invalid" {
  const text = value.trim().replace(/^#/, "");
  if (!text) return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) return "invalid";
  return Number(text);
}

/**
 * The series called `name`, created if there is none. Matched without regard
 * to case, so "discworld" typed on one work joins the "Discworld" already
 * here rather than starting a second.
 */
export async function ensureSeries(tx: Tx, name: string, userId: string): Promise<string> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const [existing] = await tx
    .select({ id: series.id })
    .from(series)
    .where(eq(sql`lower(${series.name})`, trimmed.toLowerCase()))
    .limit(1);
  if (existing) return existing.id;

  const id = randomUUID();
  const base = slugify(trimmed);
  const [clash] = await tx.select({ id: series.id }).from(series).where(eq(series.slug, base));
  await tx.insert(series).values({
    id,
    name: trimmed,
    slug: clash ? `${base}-${id.slice(0, 8)}` : base,
    createdBy: userId,
  });
  return id;
}

/**
 * Puts a work in a series at a position, or — with a blank name — takes it
 * out. A series left with no works is deleted: series only ever come into
 * being through a work, so an empty one is debris, and it would otherwise
 * keep being offered as a name to join.
 */
export async function setWorkSeries(
  tx: Tx,
  workId: string,
  name: string,
  position: number | null,
  userId: string,
): Promise<void> {
  const [before] = await tx.select({ seriesId: works.seriesId }).from(works).where(eq(works.id, workId));

  if (!name.trim()) {
    await tx.update(works).set({ seriesId: null, seriesPosition: null }).where(eq(works.id, workId));
  } else {
    const seriesId = await ensureSeries(tx, name, userId);
    await tx.update(works).set({ seriesId, seriesPosition: position }).where(eq(works.id, workId));
  }

  if (before?.seriesId) {
    const [left] = await tx
      .select({ id: works.id })
      .from(works)
      .where(eq(works.seriesId, before.seriesId))
      .limit(1);
    if (!left) await tx.delete(series).where(eq(series.id, before.seriesId));
  }
}
