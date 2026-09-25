"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import { SHELF_LABELS, SHELVES } from "@/lib/shelves";

import { changeSelectedShelf, tagSelected, untagSelected, type BulkState } from "./bulk-actions";
import { Cover } from "./cover";
import { haystackOf, headlineOf, ratingLabel, type ShelfCard } from "./shelf-card";

export type ShelfSection = { label: string; cards: ShelfCard[] };

const BUTTON =
  "border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";
const FIELD = "border border-line bg-ground px-2 py-1.5 text-ink outline-none focus:border-ink-dim";

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
  tags,
}: {
  sections: ShelfSection[];
  /** Section headings only mean something when the shelf is grouped. */
  grouped: boolean;
  view: "grid" | "list";
  /** Your tags, for bulk removal. */
  tags: { slug: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [shelfState, shelfAction, shelfPending] = useActionState<BulkState, FormData>(changeSelectedShelf, null);
  const [tagState, tagAction, tagPending] = useActionState<BulkState, FormData>(tagSelected, null);
  const [untagState, untagAction, untagPending] = useActionState<BulkState, FormData>(untagSelected, null);
  const pending = shelfPending || tagPending || untagPending;
  // Whichever action ran last; each resets only when it runs again.
  const [lastRan, setLastRan] = useState<"shelf" | "tag" | "untag" | null>(null);
  const message = { shelf: shelfState, tag: tagState, untag: untagState }[lastRan ?? "shelf"]?.message;

  function toggle(entryId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(entryId)) next.add(entryId);
      return next;
    });
  }

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
  const visibleIds = shown.flatMap((section) => section.cards.map((card) => card.entryId));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

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

        {/* A mode, not a checkbox on every cover: the art is the content and
            the interface is the frame (gameshelf §5b). Off until asked for. */}
        <button
          type="button"
          onClick={() => {
            setSelecting((on) => !on);
            setSelected(new Set());
            setLastRan(null);
          }}
          className={BUTTON}
        >
          {selecting ? "Done selecting" : "Select"}
        </button>

        {selecting ? (
          <>
            <span className="text-ink-dim">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleIds))}
              className="text-ink-dim underline hover:text-ink"
            >
              {allVisibleSelected ? "Clear" : "Select all shown"}
            </button>
          </>
        ) : null}
      </div>

      {selecting ? (
        <form className="mb-6 flex flex-wrap items-end gap-3 border border-line p-3 font-narrow">
          {/* The selection, as fields: hidden inputs survive the reset React
              does when a form action resolves, because a reset restores exactly
              the value rendered here. */}
          {[...selected].map((entryId) => (
            <input key={entryId} type="hidden" name="entryId" value={entryId} />
          ))}

          <select name="shelf" defaultValue="finished" aria-label="Shelf to move to" className={FIELD}>
            {SHELVES.map((shelf) => (
              <option key={shelf} value={shelf}>
                {SHELF_LABELS[shelf]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            formAction={(data) => {
              setLastRan("shelf");
              shelfAction(data);
            }}
            disabled={pending || selected.size === 0}
            className={BUTTON}
          >
            {shelfPending ? "Moving…" : "Move to shelf"}
          </button>

          <input name="tag" maxLength={60} placeholder="Tag" aria-label="Tag to add" list="bulk-tags" className={`${FIELD} w-36`} />
          <datalist id="bulk-tags">
            {tags.map((tag) => (
              <option key={tag.slug} value={tag.name} />
            ))}
          </datalist>
          <button
            type="submit"
            formAction={(data) => {
              setLastRan("tag");
              tagAction(data);
            }}
            disabled={pending || selected.size === 0}
            className={BUTTON}
          >
            {tagPending ? "Tagging…" : "Add tag"}
          </button>

          {tags.length > 0 ? (
            <>
              <select name="untag" defaultValue="" aria-label="Tag to remove" className={FIELD}>
                <option value="">Tag to remove</option>
                {tags.map((tag) => (
                  <option key={tag.slug} value={tag.slug}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                formAction={(data) => {
                  setLastRan("untag");
                  untagAction(data);
                }}
                disabled={pending || selected.size === 0}
                className={BUTTON}
              >
                {untagPending ? "Removing…" : "Remove tag"}
              </button>
            </>
          ) : null}

          {message ? (
            <span role="status" className="text-ink-dim">
              {message}
            </span>
          ) : null}
        </form>
      ) : null}

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
                <Tile
                  key={card.entryId}
                  card={card}
                  index={tileIndex++}
                  selecting={selecting}
                  checked={selected.has(card.entryId)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col">
              {section.cards.map((card) => (
                <Row
                  key={card.entryId}
                  card={card}
                  selecting={selecting}
                  checked={selected.has(card.entryId)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

type Selectable = {
  selecting: boolean;
  checked: boolean;
  onToggle: (entryId: string) => void;
};

/**
 * In select mode the whole tile is the target. A checkbox small enough not to
 * sit on the art would be too small to hit on a phone. Drawn rather than a
 * real <input>, so what is selected has one answer: the state above.
 */
function SelectOverlay({ card, title, checked, onToggle }: { card: ShelfCard; title: string } & Omit<Selectable, "selecting">) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={title}
      onClick={() => onToggle(card.entryId)}
      className="absolute inset-0 z-10 flex items-start p-2"
    >
      <span className={`size-5 border border-ink ${checked ? "bg-ink" : "bg-ground/80"}`} />
    </button>
  );
}

function Tile({ card, index, selecting, checked, onToggle }: { card: ShelfCard; index: number } & Selectable) {
  const { title, subtitle } = headlineOf(card);

  if (selecting) {
    return (
      <li
        className={`relative${checked ? " outline-2 -outline-offset-2 outline-ink" : ""}`}
        style={{ "--tile-index": index } as React.CSSProperties}
      >
        <Cover
          title={card.workTitle}
          author={card.authors.join(", ") || null}
          coverUrl={card.coverUrl}
          band={bandOf(card)}
        />
        <SelectOverlay card={card} title={title} checked={checked} onToggle={onToggle} />
      </li>
    );
  }

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

function Row({ card, selecting, checked, onToggle }: { card: ShelfCard } & Selectable) {
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

  if (selecting) {
    return (
      <li className="border-b border-line">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onToggle(card.entryId)}
          className="flex w-full items-center gap-4 py-2 text-left hover:bg-panel"
        >
          <span className={`size-5 shrink-0 border border-ink ${checked ? "bg-ink" : ""}`} />
          <span className="min-w-0">
            <span className="block truncate">{title}</span>
            {subtitle ? <span className="block truncate font-narrow">{subtitle}</span> : null}
          </span>
        </button>
      </li>
    );
  }

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
