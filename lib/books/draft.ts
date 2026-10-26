import { asc, eq, sql } from "drizzle-orm";

import { authorSortFor } from "@/lib/authors";
import { db } from "@/lib/db";
import { series, works } from "@/lib/db/schema";

import type { CatalogueBook } from "./add-from-catalogue";
import { readWorkFields } from "./edit-fields";
import { LATEST, nextPosition, parsePosition, setWorkSeries, type Position } from "./series";
import type { Tx, WorkFetch } from "./works";

/**
 * A book's details as the add form shows them, before anything is saved
 * (Jay, 2026-10-21: "you need to be able to edit the details before
 * adding"). The catalogue's answer fills them in, and what comes back is
 * what a new work is made from. A work already here keeps its own; its Edit
 * details page changes them.
 */
export type BookDraft = {
  title: string;
  subtitle: string | null;
  authors: string[];
  /** Blank works it out from the first author, as on the edit page. */
  authorSort: string | null;
  firstPublishedYear: number | null;
  summary: string | null;
  /**
   * Null is no series. Undefined leaves the series to the add: a comic run's
   * series belongs to its Comic Vine volume and is not edited on the form.
   */
  series?: { name: string; position: Position } | null;
};

export function draftFromOpenLibrary(fetched: WorkFetch): BookDraft {
  return {
    title: fetched.summary.title,
    subtitle: fetched.summary.subtitle,
    authors: fetched.summary.authors,
    authorSort: null,
    firstPublishedYear: fetched.summary.firstPublishedYear,
    summary: fetched.record.summary,
    series: null,
  };
}

export function draftFromCatalogue(book: CatalogueBook): BookDraft {
  return {
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors,
    authorSort: null,
    firstPublishedYear: book.year,
    summary: book.summary,
    series: book.series?.run ? undefined : book.series ? { name: book.series.name, position: book.series.position } : null,
  };
}

type Read = { ok: true; draft: BookDraft } | { ok: false; error: string };

/**
 * The form's fields, read by the edit page's own rules. Undefined when the
 * form sent none — a book already here, whose page shows no details.
 */
export function readBookDraft(formData: FormData): Read | undefined {
  if (!formData.has("title")) return undefined;
  const fields = readWorkFields(formData);
  if (!fields.ok) return fields;

  let seriesPart: BookDraft["series"];
  if (formData.has("series")) {
    const name = String(formData.get("series") ?? "").trim().slice(0, 200);
    const typed = String(formData.get("position") ?? "").trim();
    // The tickbox on the form; the API sends `position: "latest"`.
    const latest = formData.get("latest") === "on" || typed.toLowerCase() === LATEST;
    const position = latest ? LATEST : parsePosition(typed);
    if (position === "invalid") return { ok: false, error: "The series number should be a number like 8 or 2.5." };
    seriesPart = name ? { name, position } : null;
  }

  const set = fields.set;
  return {
    ok: true,
    draft: {
      title: set.title ?? "",
      subtitle: set.subtitle ?? null,
      authors: set.authors ?? [],
      // readWorkFields fills a blank sort from the first author; kept as typed.
      authorSort: String(formData.get("authorSort") ?? "").trim().slice(0, 200) || null,
      firstPublishedYear: set.firstPublishedYear ?? null,
      summary: set.summary ?? null,
      series: seriesPart,
    },
  };
}

/** The API's `details`, as JSON, read through the same rules as the form. */
export function readBookDraftJson(details: Record<string, unknown>): Read {
  const form = new FormData();
  const put = (field: string, value: unknown) => {
    if (typeof value === "string") form.set(field, value);
    else if (typeof value === "number") form.set(field, String(value));
    else if (value === null) form.set(field, "");
  };
  put("title", details.title ?? "");
  put("subtitle", details.subtitle);
  form.set("authors", Array.isArray(details.authors) ? details.authors.filter((a) => typeof a === "string").join(", ") : "");
  put("authorSort", details.authorSort);
  put("year", details.firstPublishedYear);
  put("summary", details.summary);
  if ("series" in details) {
    const s = details.series;
    const named = s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : null;
    put("series", named && typeof named.name === "string" ? named.name : "");
    put("position", named?.position ?? "");
  }
  return readBookDraft(form) ?? { ok: false, error: "A book needs a title." };
}

/** Writes a draft over a work this add has just created, inside its transaction. */
export async function applyBookDraft(tx: Tx, workId: string, draft: BookDraft, userId: string): Promise<void> {
  await tx
    .update(works)
    .set({
      title: draft.title.slice(0, 500),
      subtitle: draft.subtitle,
      authors: draft.authors,
      authorSort: draft.authorSort ?? authorSortFor(draft.authors[0]),
      firstPublishedYear: draft.firstPublishedYear,
      summary: draft.summary,
    })
    .where(eq(works.id, workId));
  if (draft.series !== undefined) {
    await setWorkSeries(tx, workId, draft.series?.name ?? "", draft.series?.position ?? null, userId);
  }
}

/** The series already here, for the form's series box to suggest. */
export async function seriesNames(): Promise<string[]> {
  return (await db.select({ name: series.name }).from(series).orderBy(asc(series.name))).map((s) => s.name);
}

/**
 * The number "Latest" would give a book in the series called `name` (matched
 * as `ensureSeries` matches), for the form to show before Add. A series not
 * here yet starts at 1.
 */
export async function latestPositionFor(name: string): Promise<number> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return 1;
  const [found] = await db
    .select({ id: series.id })
    .from(series)
    .where(eq(sql`lower(${series.name})`, trimmed.toLowerCase()))
    .limit(1);
  return found ? nextPosition(db, found.id) : 1;
}
