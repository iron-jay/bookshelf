import { shelfStatus } from "@/lib/db/schema";

export type Shelf = (typeof shelfStatus.enumValues)[number];

/**
 * The shelves in the order a shelf reads in. The column is `status`; the
 * interface calls them shelves and the free-form ones tags. Kept as a list
 * rather than read off the enum so the order stays a decision.
 */
export const SHELVES = ["tbr", "reading", "finished", "dnf"] as const satisfies readonly Shelf[];

export const SHELF_LABELS: Readonly<Record<Shelf, string>> = {
  tbr: "To read",
  reading: "Reading",
  finished: "Finished",
  dnf: "Did not finish",
};

/** Takes `unknown` because most callers are handing it a raw FormData value. */
export function isShelf(value: unknown): value is Shelf {
  return typeof value === "string" && (SHELVES as readonly string[]).includes(value);
}
