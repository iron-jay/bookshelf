"use client";

import { useEffect, useId, useState } from "react";

/** Long enough to read a name, short enough that the box visibly changes while you look at it. */
const EXAMPLE_MS = 2200;

/** Enough to choose from without the list pushing Save off a phone screen. */
const MAX_SUGGESTIONS = 6;

/**
 * A box for a series or collection name: the names already here drop down as
 * you type, and anything else you type is a new one. gameshelf has the same
 * box for its series (2026-10-20).
 *
 * A list of our own rather than a <datalist>, which a phone shows as a thin
 * strip above the keyboard, if at all. Matching ignores case, as saving does,
 * so picking "discworld" and typing it are the same thing.
 *
 * The example cycles (Jay, 2026-10-20), through the names already here where
 * there are enough of them, so the placeholder doubles as a hint at what is
 * there.
 */
export function NameInput({
  label,
  name,
  names,
  examples,
  defaultValue = "",
  maxLength = 200,
  kind,
  onValueChange,
}: {
  label: string;
  name: string;
  names: readonly string[];
  /** Shown in turn while the box is empty, when there are too few names here to show. */
  examples: readonly string[];
  defaultValue?: string;
  maxLength?: number;
  /** "series" or "collection", for the line that says a typed name is new. */
  kind: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValueState] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  function setValue(next: string) {
    setValueState(next);
    onValueChange?.(next);
  }

  const cycle = names.length >= 3 ? names : examples;
  const [exampleIndex, setExampleIndex] = useState(0);
  const cycling = value === "" && !open;
  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(() => setExampleIndex((i) => (i + 1) % cycle.length), EXAMPLE_MS);
    return () => clearInterval(timer);
  }, [cycling, cycle.length]);

  const needle = value.trim().toLowerCase();
  const exact = names.some((known) => known.toLowerCase() === needle);
  // Names that start with what was typed come first: "Dis" means Discworld
  // before it means The Disappearing Spoon.
  const suggestions = names
    .filter((known) => known.toLowerCase() !== needle && known.toLowerCase().includes(needle))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(needle)) - Number(!b.toLowerCase().startsWith(needle)))
    .slice(0, MAX_SUGGESTIONS);
  const showing = open && suggestions.length > 0;

  function choose(picked: string) {
    setValue(picked);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative flex w-64 flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-ink-dim">{label}</span>
        <input
          name={name}
          type="text"
          maxLength={maxLength}
          autoComplete="off"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={cycle.length > 0 ? `e.g. ${cycle[exampleIndex % cycle.length]}` : undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          // Late enough for a tap on a suggestion to land first.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!showing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i <= 0 ? suggestions.length : i) - 1);
            } else if (event.key === "Enter" && active >= 0) {
              // Choosing, not saving: the second Enter saves.
              event.preventDefault();
              choose(suggestions[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="field"
        />
      </label>

      {showing ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-line-strong bg-band"
        >
          {suggestions.map((known, i) => (
            <li
              key={known}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(event) => {
                // Keep focus in the box, so the blur above does not close the
                // list before this tap counts.
                event.preventDefault();
                choose(known);
              }}
              className={`cursor-pointer px-3 py-2.5 ${i === active ? "bg-panel" : "hover:bg-panel"}`}
            >
              {known}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-sm text-ink-dim">
        {showing
          ? `Tap one to use it, or keep typing for a new ${kind}.`
          : needle && !exact
            ? `“${value.trim()}” will be a new ${kind}.`
            : `Pick one already here, or type a new one.`}
      </p>
    </div>
  );
}
