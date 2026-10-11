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
  status: Shelf;
  rating: number | null;
  coverUrl: string | null;
  lastFinishedOn: string | null;
};

/** The two lines a card leads with: the book, then who wrote it. */
export function headlineOf(card: ShelfCard): { title: string; subtitle: string | null } {
  return { title: card.workTitle, subtitle: card.authors.join(", ") || null };
}

/** Stored 1..10 and shown 1..10: a ten-point scale with no halves or stars. */
export function ratingLabel(rating: number | null): string {
  return rating === null ? "Unrated" : `${rating}/10`;
}

/** What the filter box matches: every line a card can show, author included. */
export function haystackOf(card: ShelfCard): string {
  return [card.workTitle, card.editionName, ...card.authors]
    .join(" ")
    .toLowerCase();
}
