import type { EntryDetail } from "@/lib/books/read";
import type { Run } from "@/lib/books/runs";
import type { ShelfRow } from "@/lib/books/shelf";

/**
 * The one shape a shelf item has on the phone, in both apps: gameshelf's card
 * has the same top-level fields. `versionId` is the edition here, keeping the
 * name so the phone's grid is written once; what only books have sits under
 * `extra`.
 */
export type Card = {
  id: string;
  versionId: string;
  workSlug: string;
  title: string;
  subtitle: string;
  creator: string | null;
  coverUrl: string | null;
  shelf: string;
  rating: number | null;
  completion: null;
  isFavourite: boolean;
  year: number | null;
  addedAt: string | null;
  lastFinishedOn: string | null;
  series: { name: string; position: number | null } | null;
  /**
   * Set only on a folded comic run (GET /shelf?runs=fold): many finished
   * entries standing as one card, which opens GET /series/{seriesSlug}.
   */
  run: { seriesSlug: string; issueCount: number } | null;
  extra: {
    authors: string[];
    format: "book" | "audiobook";
    editionKind: string | null;
    credit: string | null;
    language: string | null;
    collectionName: string | null;
    coverNeedsReview: boolean;
  };
};

export function cardFrom(row: ShelfRow, run: Run | null = null): Card {
  const authors = row.authors ?? [];
  const card: Card = {
    id: row.entryId ?? "",
    versionId: row.editionId ?? "",
    workSlug: row.workSlug ?? "",
    title: row.workTitle ?? "Untitled",
    subtitle: row.editionName ?? "",
    creator: authors.join(", ") || null,
    coverUrl: row.coverUrl,
    shelf: row.status ?? "tbr",
    rating: row.rating,
    // Books are finished or not; the shelf says which.
    completion: null,
    isFavourite: row.isFavourite ?? false,
    year: row.year,
    addedAt: row.addedAt ? row.addedAt.toISOString() : null,
    lastFinishedOn: row.lastFinishedOn,
    series: row.seriesName ? { name: row.seriesName, position: row.seriesPosition } : null,
    run: null,
    extra: {
      authors,
      format: row.format ?? "book",
      editionKind: row.editionKind,
      credit: row.editionCredit,
      language: row.language,
      collectionName: row.collectionName,
      coverNeedsReview: row.coverNeedsReview ?? false,
    },
  };
  if (!run) return card;
  // As the web's run tile: the series' name, its first issue's cover, the
  // latest finish, and no rating, since each issue has its own.
  return {
    ...card,
    id: `run:${run.seriesId}`,
    title: run.name,
    subtitle: `${run.issueCount} issues`,
    rating: null,
    isFavourite: false,
    run: { seriesSlug: run.slug, issueCount: run.issueCount },
  };
}

/** One entry in full: its card, plus what the shelf leaves out. */
export function entryJson(detail: EntryDetail) {
  return {
    ...cardFrom(detail.row),
    review: detail.review,
    reviewHasSpoilers: detail.reviewHasSpoilers,
    isPrivate: detail.isPrivate,
    tags: detail.tags,
    reads: detail.reads,
  };
}
