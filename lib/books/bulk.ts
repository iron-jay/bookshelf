import { and, eq, inArray, sql } from "drizzle-orm";

import { setWorkSeries } from "@/lib/books/series";
import { changeShelf } from "@/lib/books/shelving";
import { cleanTagName, ensureTag, tagEntries, untagEntries } from "@/lib/books/tags";
import { db } from "@/lib/db";
import { editions, entries, series, tags, works } from "@/lib/db/schema";
import { isShelf, SHELF_LABELS } from "@/lib/shelves";
import { isUuid } from "@/lib/uuid";

/**
 * The wall's select mode (§5, "Selection checkboxes with bulk shelf change"),
 * shared by its server actions and the phone's `POST /entries/bulk`, so both
 * apply the same rules and say the same things.
 */

export type BulkResult = { ok: boolean; message: string };

const NOTHING: BulkResult = { ok: false, message: "Nothing selected." };

/**
 * The selected entries that are yours. Ids come from the page or the phone,
 * so they are narrowed to your own rows before anything is changed.
 */
async function yours(userId: string, given: readonly unknown[]): Promise<string[]> {
  const ids = given.filter((value): value is string => typeof value === "string" && isUuid(value)).slice(0, 5000);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.id, ids)));
  return rows.map((row) => row.id);
}

function plural(n: number): string {
  return `${n} ${n === 1 ? "book" : "books"}`;
}

/** Same rules as the edition page, entry by entry, in one transaction. */
export async function moveToShelf(userId: string, given: readonly unknown[], shelf: string): Promise<BulkResult> {
  if (!isShelf(shelf)) return { ok: false, message: "Choose a shelf." };
  const ids = await yours(userId, given);
  if (ids.length === 0) return NOTHING;
  await db.transaction(async (tx) => {
    for (const id of ids) await changeShelf(tx, id, shelf);
  });
  return { ok: true, message: `Moved ${plural(ids.length)} to ${SHELF_LABELS[shelf]}.` };
}

export async function tagAll(userId: string, given: readonly unknown[], typed: string): Promise<BulkResult> {
  const name = cleanTagName(typed.trim());
  if (!name) return { ok: false, message: "Type a tag to add." };
  const ids = await yours(userId, given);
  if (ids.length === 0) return NOTHING;
  await db.transaction(async (tx) => tagEntries(tx, await ensureTag(tx, userId, name), ids));
  return { ok: true, message: `Tagged ${plural(ids.length)} ${name}.` };
}

/** `slug`: the tag's, as the shelf's tag list names it. */
export async function untagAll(userId: string, given: readonly unknown[], slug: string): Promise<BulkResult> {
  const [tag] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.slug, slug.trim())));
  if (!tag) return { ok: false, message: "Choose a tag to remove." };
  const ids = await yours(userId, given);
  if (ids.length === 0) return NOTHING;
  await db.transaction((tx) => untagEntries(tx, tag.id, ids));
  return { ok: true, message: `Removed ${tag.name} from ${plural(ids.length)}.` };
}

/**
 * Put every selected book in one series: collecting a series from the wall
 * rather than one book page at a time. Series are shared catalogue, so this
 * files the works, for everyone, as the book page's series box does.
 *
 * A book already in that series keeps its number; one joining it has none
 * until it is given one. An empty box is refused rather than read as "take
 * them all out", which nobody means by forgetting to type; the book page
 * takes one out.
 */
export async function putInSeries(userId: string, given: readonly unknown[], typed: string): Promise<BulkResult> {
  const name = typed.trim().slice(0, 200).replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "Type a series name." };
  const ids = await yours(userId, given);
  if (ids.length === 0) return NOTHING;

  const placed = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: series.id, name: series.name })
      .from(series)
      .where(eq(sql`lower(${series.name})`, name.toLowerCase()))
      .limit(1);
    const targets = await tx
      .selectDistinct({ workId: works.id, seriesId: works.seriesId, position: works.seriesPosition })
      .from(entries)
      .innerJoin(editions, eq(editions.id, entries.editionId))
      .innerJoin(works, eq(works.id, editions.workId))
      .where(inArray(entries.id, ids));
    for (const work of targets) {
      const stays = existing && work.seriesId === existing.id;
      await setWorkSeries(tx, work.workId, name, stays ? work.position : null, userId);
    }
    return { count: targets.length, name: existing?.name ?? name };
  });
  return { ok: true, message: `Put ${plural(placed.count)} in ${placed.name}.` };
}
