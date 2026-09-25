"use client";

import { useState } from "react";

import Image from "next/image";

// The normaliser, not the package index: the index pulls the request queue and
// its User-Agent into the client bundle.
import { coverUrl } from "@/lib/openlibrary/normalise";

import type { Format } from "./format";

export type PickerEdition = {
  key: string;
  title: string | null;
  format: Format;
  physicalFormat: string | null;
  publisher: string | null;
  year: number | null;
  languageName: string | null;
  isbn: string | null;
  pages: number | null;
  coverId: number | null;
  narrators: string[];
  onShelf: boolean;
};

function detailsOf(edition: PickerEdition): string {
  return [
    edition.physicalFormat,
    edition.publisher,
    edition.year,
    edition.languageName,
    edition.pages ? `${edition.pages} pages` : null,
  ]
    .filter((part) => part !== null && part !== "")
    .join(" · ");
}

function haystackOf(edition: PickerEdition): string {
  return [edition.title, detailsOf(edition), edition.isbn].join(" ").toLowerCase();
}

/**
 * Open Library's editions for one format, filterable, with "any edition" first.
 * A work can have hundreds, most of them near-duplicates, so the filter matches
 * everything shown on a row — "corgi", "1990", "german", an ISBN.
 */
export function EditionPicker({
  editions,
  format,
  workTitle,
  selected,
  onSelect,
}: {
  editions: PickerEdition[];
  format: Format;
  workTitle: string;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const ofFormat = editions.filter((edition) => edition.format === format);
  const needle = filter.trim().toLowerCase();
  const shown = needle ? ofFormat.filter((e) => haystackOf(e).includes(needle)) : ofFormat;
  const noun = format === "audiobook" ? "audiobook" : "book";

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-narrow text-ink-dim">Edition</legend>
      {/* The choice is submitted from here, not from the radios: filtering can
          unmount the chosen row, and an unmounted radio submits nothing — which
          the server would read as "any edition". */}
      <input type="hidden" name="edition" value={selected} />

      <Option
        name={`Any ${noun} edition`}
        details={`Not a particular printing. Named “${format === "audiobook" ? "Audiobook" : "Book"}”.`}
        value=""
        checked={selected === ""}
        onSelect={onSelect}
      />

      {ofFormat.length > 0 ? (
        <>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by publisher, year, language or ISBN"
            aria-label="Filter editions"
            className="mt-2 w-full max-w-md border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim"
          />
          <p className="font-narrow text-ink-dim">
            {shown.length === ofFormat.length
              ? `${ofFormat.length} ${noun} edition${ofFormat.length === 1 ? "" : "s"} on Open Library`
              : `${shown.length} of ${ofFormat.length}`}
          </p>
          <div className="max-h-[32rem] overflow-y-auto border-y border-line">
            {shown.map((edition) => (
              <Option
                key={edition.key}
                name={
                  edition.title && edition.title !== workTitle ? edition.title : detailsOf(edition) || edition.key
                }
                details={edition.title && edition.title !== workTitle ? detailsOf(edition) : null}
                isbn={edition.isbn}
                coverId={edition.coverId}
                onShelf={edition.onShelf}
                value={edition.key}
                checked={selected === edition.key}
                onSelect={onSelect}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="font-narrow text-ink-dim">
          Open Library lists no {noun} editions of this work.
        </p>
      )}
    </fieldset>
  );
}

function Option({
  name,
  details,
  isbn,
  coverId,
  onShelf,
  value,
  checked,
  onSelect,
}: {
  name: string;
  details: string | null;
  isbn?: string | null;
  coverId?: number | null;
  onShelf?: boolean;
  value: string;
  checked: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-l-2 py-2 pr-2 pl-3 ${
        checked ? "border-ink bg-panel" : "border-transparent hover:bg-panel"
      }`}
    >
      <input
        type="radio"
        name="edition-choice"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {coverId !== undefined ? (
        <span className="h-12 w-8 shrink-0 bg-panel">
          {coverId ? (
            <Image
              src={coverUrl(coverId, "S")}
              alt=""
              width={32}
              height={48}
              className="h-12 w-8 object-cover"
              // Hundreds of thumbnails for a list most of which is never
              // chosen: straight from Open Library, never optimised or stored.
              unoptimized
            />
          ) : null}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {details ? <span className="block truncate font-narrow text-ink-dim">{details}</span> : null}
        {isbn || onShelf ? (
          <span className="block font-narrow text-ink-dim">
            {isbn ? <span className="font-mono">{isbn}</span> : null}
            {isbn && onShelf ? " · " : null}
            {onShelf ? "On your shelf" : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}
