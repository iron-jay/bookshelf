import type { Shelf } from "@/lib/shelves";

/** One entry as the shelf draws it. Built from entry_cards on the server. */
export type ShelfCard = {
  entryId: string;
  editionId: string;
  workTitle: string;
  authors: string[];
  editionName: string;
  editionCredit: string | null;
  format: "book" | "audiobook";
  editionKind: string;
  status: Shelf;
  rating: number | null;
  coverUrl: string | null;
  isCommunityEdition: boolean;
  /** Set for a fic: the work it is a fanwork of. */
  derivedFromTitle: string | null;
  lastFinishedOn: string | null;
};

/**
 * The two lines a card leads with. An official edition is the book, so the
 * work leads and the author follows. A community edition is the thing you
 * actually read, so its own name leads and the source work is the subtitle
 * (§5b) — same two lines, opposite order.
 *
 * A fic is the exception that proves the model: it is a work in its own right,
 * and its edition is only where it was posted ("AO3"). So it leads with its own
 * title, like a book, and names what it is a fanwork of when that is known.
 */
export function headlineOf(card: ShelfCard): { title: string; subtitle: string | null } {
  const author = card.authors.join(", ") || null;
  if (!card.isCommunityEdition || card.editionKind === "fanfic") {
    const of = card.derivedFromTitle ? `of ${card.derivedFromTitle}` : null;
    return { title: card.workTitle, subtitle: [author, of].filter(Boolean).join(" · ") || null };
  }
  return { title: card.editionName, subtitle: card.workTitle };
}

/** Stored 1..10 and shown 1..10: a ten-point scale with no halves or stars. */
export function ratingLabel(rating: number | null): string {
  return rating === null ? "Unrated" : `${rating}/10`;
}

/** What the filter box matches: every line a card can show, author included. */
export function haystackOf(card: ShelfCard): string {
  return [card.workTitle, card.editionName, card.derivedFromTitle, ...card.authors]
    .join(" ")
    .toLowerCase();
}
