"use client";

import type { Format } from "./format";

const OPTIONS: { value: Format; label: string }[] = [
  { value: "book", label: "Book" },
  { value: "audiobook", label: "Audiobook" },
];

/**
 * Two options, not a dropdown, on every path that creates an edition. Radio
 * inputs underneath, so it submits with scripting off. `locked` is for podfic,
 * which is always audio and shows the toggle rather than hiding it, so the
 * choice is visibly made rather than silently absent.
 */
export function FormatToggle({
  value,
  onChange,
  locked = false,
}: {
  value: Format;
  onChange: (format: Format) => void;
  locked?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-narrow text-ink-dim">Book or audiobook</legend>
      <div className="flex">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`-ml-px border px-4 py-2 first:ml-0 ${
                selected ? "relative border-ink text-ink" : "border-line text-ink-dim"
              } ${locked ? "cursor-not-allowed" : "cursor-pointer hover:text-ink"}`}
            >
              <input
                type="radio"
                name="format"
                value={option.value}
                checked={selected}
                disabled={locked && !selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
