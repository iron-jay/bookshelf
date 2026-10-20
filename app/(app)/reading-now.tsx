import Link from "next/link";

import { Cover } from "./cover";
import { setShelf } from "./edition/[id]/actions";
import { FinishPrompt } from "./finish-prompt";
import type { ShelfCard } from "./shelf-card";

/**
 * The band across the top of the shelves: what you are reading, large, with
 * the two things you do to a book in hand one press away. Finishing closes
 * the open read today, exactly as choosing Finished on the book's page does,
 * and asks for a rating on the way.
 */
export function ReadingNow({ cards }: { cards: ShelfCard[] }) {
  return (
    <section className="bg-band px-4 pt-6 pb-7 sm:px-10">
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-3xl sm:text-4xl">Reading now</h1>
        <span className="text-ink-dim">
          {cards.length === 0 ? "Nothing on the go" : `${cards.length} ${cards.length === 1 ? "book" : "books"}`}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="font-narrow text-ink-dim">Start a book and it waits for you here.</p>
      ) : (
        <ul className="grid gap-4 sm:gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {cards.map((card) => (
            <li key={card.entryId} className="flex gap-4">
              <Link href={`/edition/${card.editionId}`} className="w-20 shrink-0 sm:w-28">
                <span className="sr-only">{card.workTitle}</span>
                <Cover title={card.workTitle} author={card.authors.join(", ") || null} coverUrl={card.coverUrl} />
              </Link>

              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={`/edition/${card.editionId}`}
                  className="font-serif text-xl leading-tight font-semibold hover:underline"
                >
                  {card.workTitle}
                </Link>
                <span className="font-narrow text-ink-dim">
                  {[card.authors.join(", "), card.format === "audiobook" ? "Audiobook" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <div className="flex-1" />
                <div className="flex flex-wrap gap-2">
                  <FinishPrompt
                    action={setShelf}
                    fields={{ editionId: card.editionId, shelf: "finished" }}
                    title={card.workTitle}
                    rating={card.rating}
                  />
                  <form action={setShelf}>
                    <input type="hidden" name="editionId" value={card.editionId} />
                    <button type="submit" name="shelf" value="dnf" className="btn btn-sm">
                      Did not finish
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
