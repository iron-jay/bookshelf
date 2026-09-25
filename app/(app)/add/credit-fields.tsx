"use client";

const FIELD =
  "border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/**
 * One free-text credit per edition, labelled by what the edition is (schema:
 * editions.credit): "Translated by" for any translation, else "Read by" for an
 * audiobook. A translated audiobook names its translator; the reader goes in
 * notes. Null means the field has nothing to say for this edition.
 */
export function creditLabelFor(kind: string, format: "book" | "audiobook"): string | null {
  if (kind === "translation" || kind === "fan_translation") return "Translated by";
  if (format === "audiobook") return "Read by";
  return null;
}

export function CreditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (credit: string) => void;
}) {
  return (
    <label className="flex min-w-64 flex-1 flex-col gap-1.5">
      <span className="font-narrow text-ink-dim">{label}</span>
      <input
        name="credit"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={200}
        className={FIELD}
      />
    </label>
  );
}

/**
 * Audiobooks only, optional. Hours and minutes because that is how every
 * audiobook lists it; the column is minutes.
 */
export function LengthField() {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-narrow text-ink-dim">Length</legend>
      <div className="flex items-center gap-2">
        <input name="hours" type="number" min={0} max={999} aria-label="Hours" className={`${FIELD} w-20`} />
        <span className="font-narrow text-ink-dim">h</span>
        <input name="minutes" type="number" min={0} max={59} aria-label="Minutes" className={`${FIELD} w-20`} />
        <span className="font-narrow text-ink-dim">min</span>
      </div>
    </fieldset>
  );
}
