"use client";

const FIELD =
  "border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/**
 * Shown only for Audiobook. Both optional. Length is hours and minutes because
 * that is how every audiobook lists it; the column is minutes.
 */
export function AudiobookFields({
  credit,
  onCreditChange,
}: {
  credit: string;
  onCreditChange: (credit: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex min-w-64 flex-1 flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Read by</span>
        <input
          name="credit"
          value={credit}
          onChange={(event) => onCreditChange(event.target.value)}
          maxLength={200}
          className={FIELD}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 font-narrow text-ink-dim">Length</legend>
        <div className="flex items-center gap-2">
          <input
            name="hours"
            type="number"
            min={0}
            max={999}
            aria-label="Hours"
            className={`${FIELD} w-20`}
          />
          <span className="font-narrow text-ink-dim">h</span>
          <input
            name="minutes"
            type="number"
            min={0}
            max={59}
            aria-label="Minutes"
            className={`${FIELD} w-20`}
          />
          <span className="font-narrow text-ink-dim">min</span>
        </div>
      </fieldset>
    </div>
  );
}
