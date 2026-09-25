"use client";

import { useState } from "react";

import Link from "next/link";

import { SHELF_LABELS } from "@/lib/shelves";

import { Cover } from "./cover";
import { haystackOf, headlineOf, ratingLabel, type ShelfCard } from "./shelf-card";

export type ShelfSection = { label: string; cards: ShelfCard[] };

function bandOf(card: ShelfCard): { name: string; credit: string | null } | null {
  return card.isCommunityEdition ? { name: card.editionName, credit: card.editionCredit } : null;
}

/**
 * The shelf, filtered as you type. Every card is already on the client, so a
 * keystroke is a re-render of a few hundred items rather than a round trip
 * (gameshelf, 2026-09-18). The nav's Search is the other thing: that one goes
 * out to Open Library for what is not here yet.
 */
export function ShelfGrid({
  sections,
  grouped,
  view,
}: {
  sections: ShelfSection[];
  /** Section headings only mean something when the shelf is grouped. */
  grouped: boolean;
  view: "grid" | "list";
}) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? sections
        .map((section) => ({
          ...section,
          cards: section.cards.filter((card) => haystackOf(card).includes(needle)),
        }))
        .filter((section) => section.cards.length > 0)
    : sections;

  const total = sections.reduce((sum, section) => sum + section.cards.length, 0);
  const matching = shown.reduce((sum, section) => sum + section.cards.length, 0);

  // One stagger across the whole grid rather than per section, so it still
  // reads as one shelf resolving.
  let tileIndex = 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4 font-narrow">
        <label className="flex-1 basis-64">
          <span className="sr-only">Filter this shelf</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title or author"
            className="w-full max-w-md border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-ink-dim"
          />
        </label>
        {/* Silent at zero, where the sentence below says it better. */}
        {needle && matching > 0 ? (
          <span className="text-ink-dim">
            {matching} of {total} {matching === 1 ? "matches" : "match"}
          </span>
        ) : null}
      </div>

      {needle && matching === 0 ? (
        <p className="font-narrow text-ink-dim">Nothing on your shelf matches “{query.trim()}”.</p>
      ) : null}

      {shown.map((section) => (
        <section key={section.label || "all"} className="mb-8">
          {grouped ? (
            <h2 className="mb-2 flex items-baseline gap-3 font-medium">
              {section.label}
              <span className="font-narrow text-ink-dim">{section.cards.length}</span>
            </h2>
          ) : null}

          {view === "grid" ? (
            // 4px, not gameshelf's first 1px: settled there after launch.
            <ul className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(128px,1fr))]">
              {section.cards.map((card) => (
                <Tile key={card.entryId} card={card} index={tileIndex++} />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col">
              {section.cards.map((card) => (
                <Row key={card.entryId} card={card} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

function Tile({ card, index }: { card: ShelfCard; index: number }) {
  const { title, subtitle } = headlineOf(card);

  return (
    <li
      className="shelf-tile group relative"
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <Link href={`/edition/${card.editionId}`} className="block focus:outline-none">
        <span className="sr-only">{title}</span>
        <Cover
          title={card.workTitle}
          author={card.authors.join(", ") || null}
          coverUrl={card.coverUrl}
          band={bandOf(card)}
        />
        {/* Metadata on hover or focus rather than under every cover, so the
            grid stays a wall of books. pointer-events-none so the overlay never
            takes the click meant for the link beneath it. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-ground/92 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <p className="font-medium leading-snug">{title}</p>
          {subtitle ? <p className="font-narrow text-ink-dim">{subtitle}</p> : null}
          <p className="mt-1 font-narrow text-ink-dim">
            {SHELF_LABELS[card.status]} · {ratingLabel(card.rating)}
          </p>
        </div>
      </Link>
    </li>
  );
}

function Row({ card }: { card: ShelfCard }) {
  const { title, subtitle } = headlineOf(card);
  const details = [
    // A community edition's name is already the title, so its credit takes the
    // slot; an official one's name ("Paperback, Corgi Books 1990") is the detail.
    card.isCommunityEdition ? card.editionCredit : card.editionName,
    card.format === "audiobook" ? "Audiobook" : null,
    SHELF_LABELS[card.status],
    card.rating === null ? null : ratingLabel(card.rating),
    card.lastFinishedOn ? `finished ${card.lastFinishedOn}` : null,
  ].filter(Boolean);

  return (
    <li className="border-b border-line">
      <Link href={`/edition/${card.editionId}`} className="flex items-center gap-4 py-2 hover:bg-panel">
        <div className="w-12 shrink-0">
          <Cover
            title={card.workTitle}
            author={card.authors.join(", ") || null}
            coverUrl={card.coverUrl}
            // At 48px the band's text is unreadable; the list row says it
            // instead, and the band stays as the mark.
            band={card.isCommunityEdition ? { name: "", credit: null } : null}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate">{title}</p>
          {subtitle ? <p className="truncate font-narrow">{subtitle}</p> : null}
          <p className="truncate font-narrow text-ink-dim">{details.join(" · ")}</p>
        </div>
      </Link>
    </li>
  );
}
