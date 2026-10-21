"use client";

import { useActionState, useEffect, useState } from "react";

import Link from "next/link";

import { SHELF_LABELS, SHELVES } from "@/lib/shelves";

import { changeSelectedShelf, seriesSelected, tagSelected, untagSelected, type BulkState } from "./bulk-actions";
import { Cover } from "./cover";
import { NameInput } from "./name-input";
import { haystackOf, headlineOf, hrefOf, ratingLabel, type ShelfCard } from "./shelf-card";

export type ShelfSection = { label: string; href?: string; cards: ShelfCard[] };

const BUTTON = "btn";
const FIELD = "field";

/**
 * Whether the shelf has already resolved in this tab. The grid's fade-in is
 * the app's one orchestrated moment (§5b): it plays on arrival, not on every
 * return from a book, where the covers are already cached and a replayed
 * stagger — 18 ms a tile, seconds on a long shelf — reads as them reloading.
 * Module state outlives client navigations and resets on a full page load;
 * it is only set after mount, so the server and hydration always agree.
 */
let resolvedOnce = false;

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
  seriesNames,
}: {
  sections: ShelfSection[];
  /** Section headings only mean something when the shelf is grouped. */
  grouped: boolean;
  view: "grid" | "list";
  /** Your tags, for bulk removal. */
  tags: { slug: string; name: string }[];
  /** Offered in the series box, so a selection joins a series rather than misspelling one. */
  seriesNames: string[];
}) {
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [shelfState, shelfAction, shelfPending] = useActionState<BulkState, FormData>(changeSelectedShelf, null);
  const [tagState, tagAction, tagPending] = useActionState<BulkState, FormData>(tagSelected, null);
  const [untagState, untagAction, untagPending] = useActionState<BulkState, FormData>(untagSelected, null);
  const [seriesState, seriesAction, seriesPending] = useActionState<BulkState, FormData>(seriesSelected, null);
  const pending = shelfPending || tagPending || untagPending || seriesPending;
  // Whichever action ran last; each resets only when it runs again.
  const [lastRan, setLastRan] = useState<"shelf" | "tag" | "untag" | "series" | null>(null);
  const message = { shelf: shelfState, tag: tagState, untag: untagState, series: seriesState }[lastRan ?? "shelf"]
    ?.message;

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
  // A run is many entries standing as one, so it is not one to select.
  const visibleIds = shown.flatMap((section) => section.cards.filter((card) => !card.run).map((card) => card.entryId));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  // One stagger across the whole grid rather than per section, so it still
  // reads as one shelf resolving.
  let tileIndex = 0;

  const [resolving] = useState(() => !resolvedOnce);
  useEffect(() => {
    resolvedOnce = true;
  }, []);

  return (
    <div className={resolving ? "shelf-resolving" : undefined}>
      <div className="mb-6 flex flex-wrap items-center gap-3 font-narrow">
        <label className="flex-1 basis-64">
          <span className="sr-only">Filter this shelf</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title or author"
            className="field max-w-md rounded-full px-4"
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
        <form className="card mb-6 flex flex-wrap items-end gap-3 font-narrow">
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

          {/* Its own row: the box carries a hint line under it, which would
              drag the buttons beside it out of line. */}
          <div className="flex basis-full flex-wrap items-start gap-3">
            <NameInput label="Series" name="series" kind="series" names={seriesNames} examples={[]} />
            <button
              type="submit"
              formAction={(data) => {
                setLastRan("series");
                seriesAction(data);
              }}
              disabled={pending || selected.size === 0}
              className={`${BUTTON} mt-[1.6rem]`}
            >
              {seriesPending ? "Saving…" : "Put in series"}
            </button>
          </div>

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
        <section key={section.label || "all"} className="shelf-wall mb-10">
          {grouped ? (
            <h2 className="mb-1 flex items-baseline gap-3">
              {section.href ? (
                <Link href={section.href} className="font-display text-2xl hover:underline">
                  {section.label}
                </Link>
              ) : (
                <span className="font-display text-2xl">{section.label}</span>
              )}
              <span className="text-ink-dim">{section.cards.length}</span>
            </h2>
          ) : null}

          {view === "grid" ? (
            <ul className="shelf-rows">
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
    </div>
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
      className="absolute inset-0 z-30 flex items-start p-2"
    >
      <span className={`size-6 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-ink bg-ground/70"}`} />
    </button>
  );
}

/**
 * A book standing on the shelf: the whole cover, a rating sticker when it has
 * one, and its name and shelf on hover where hovering exists. On a phone a
 * cover is a plain tap through to the book.
 */
export function Tile({
  card,
  index,
  selecting = false,
  checked = false,
  onToggle = () => {},
  className = "",
}: { card: ShelfCard; index: number; className?: string } & Partial<Selectable>) {
  const { title, subtitle } = headlineOf(card);

  return (
    <li
      className={`shelf-tile group relative ${className}`}
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <div className={`relative${checked ? " outline outline-3 outline-offset-2 outline-accent" : ""}`}>
        {selecting && !card.run ? (
          <SelectOverlay card={card} title={title} checked={checked} onToggle={onToggle} />
        ) : selecting ? null : (
          <Link href={hrefOf(card)} className="absolute inset-0 z-10">
            <span className="sr-only">{title}</span>
          </Link>
        )}
        {/* A run stands as a short stack of its issues: the shelf's own
            physics rather than a badge on the art (§5b). */}
        <div className={card.run ? "run-stack" : undefined}>
          <Cover title={card.workTitle} author={card.authors.join(", ") || null} coverUrl={card.coverUrl} />
        </div>
        {card.rating !== null ? (
          <span className="sticker" aria-label={`Rated ${card.rating} out of 10`}>
            {card.rating}
          </span>
        ) : null}
        {selecting ? null : (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end overflow-hidden bg-ground/92 p-2.5 opacity-0 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
            {/* Clamped so a long title or credit stays on the cover and clear
                of the sticker; the shelf line underneath never shrinks away. */}
            <p className="line-clamp-3 min-h-0 pr-5 font-semibold leading-snug break-words">{title}</p>
            {subtitle ? <p className="line-clamp-2 shrink-0 font-narrow text-sm break-words text-ink-dim">{subtitle}</p> : null}
            <p className="mt-1 shrink-0 font-narrow text-sm text-ink-dim">
              {card.run
                ? `All ${card.run.issueCount} issues finished`
                : `${SHELF_LABELS[card.status]} · ${ratingLabel(card.rating)}`}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

function Row({ card, selecting, checked, onToggle }: { card: ShelfCard } & Selectable) {
  const { title, subtitle } = headlineOf(card);
  const details = card.run
    ? [`All ${card.run.issueCount} issues finished`, card.lastFinishedOn ? `the last ${card.lastFinishedOn}` : null].filter(Boolean)
    : [
        card.editionName,
        card.format === "audiobook" ? "Audiobook" : null,
        SHELF_LABELS[card.status],
        card.rating === null ? null : ratingLabel(card.rating),
        card.lastFinishedOn ? `finished ${card.lastFinishedOn}` : null,
      ].filter(Boolean);

  if (selecting && !card.run) {
    return (
      <li className="border-b border-line">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onToggle(card.entryId)}
          className="flex w-full items-center gap-4 py-2 text-left hover:bg-band"
        >
          <span className={`size-6 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-ink"}`} />
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
      <Link href={hrefOf(card)} className="flex items-center gap-4 py-2 hover:bg-band">
        <div className={`w-12 shrink-0${card.run ? " run-stack" : ""}`}>
          <Cover
            title={card.workTitle}
            author={card.authors.join(", ") || null}
            coverUrl={card.coverUrl}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          {subtitle ? <p className="truncate font-narrow">{subtitle}</p> : null}
          <p className="truncate font-narrow text-ink-dim">{details.join(" · ")}</p>
        </div>
      </Link>
    </li>
  );
}
