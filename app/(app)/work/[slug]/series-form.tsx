"use client";

import { useActionState } from "react";

import { saveSeries, type SeriesState } from "./actions";

const INITIAL: SeriesState = { error: null, saved: false };
const FIELD = "border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/**
 * Name and position. The names already here are offered as you type, so
 * joining Discworld is picking it rather than retyping it exactly.
 */
export function SeriesForm({
  workId,
  current,
  position,
  seriesNames,
}: {
  workId: string;
  current: string | null;
  position: number | null;
  seriesNames: string[];
}) {
  const [state, action, pending] = useActionState(saveSeries, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="workId" value={workId} />
      <div className="flex flex-wrap items-end gap-3 font-narrow">
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Series</span>
          <input
            name="series"
            list="series-names"
            defaultValue={current ?? ""}
            placeholder="Not in a series"
            maxLength={200}
            className={`${FIELD} w-64`}
          />
          <datalist id="series-names">
            {seriesNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Number</span>
          <input
            name="position"
            inputMode="decimal"
            defaultValue={position ?? ""}
            placeholder="8"
            className={`${FIELD} w-20`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="border border-line bg-panel px-3 py-2 hover:border-ink-dim disabled:text-ink-dim"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : state.saved ? (
        <p role="status" className="font-narrow text-ink-dim">
          Saved. Clear the name to take it out of the series.
        </p>
      ) : null}
    </form>
  );
}
