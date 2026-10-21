"use client";

import { useActionState, useState } from "react";

import { NameInput } from "../../name-input";
import { saveSeries, type SeriesState } from "./actions";

const INITIAL: SeriesState = { error: null, saved: false };
const FIELD = "field";

/** For a shelf with too few series of its own to show as examples. */
const EXAMPLES = ["Discworld", "The Expanse", "Earthsea", "The Murderbot Diaries", "Wayward Children"];

/**
 * Name and position. The names already here drop down as you type, so
 * joining Discworld is picking it rather than retyping it exactly.
 *
 * On the book page and on each edition's page, the page a cover opens: the
 * book page is a link away from it, too far to go looking for one field.
 *
 * Save says "Saved" until either box changes again (Jay, 2026-10-20): the
 * page refreshes in place, so nothing else shows that the save happened.
 *
 * A number another book in the series already has is asked about rather than
 * saved (Jay, 2026-10-21): move that book and the ones after it up one, or
 * keep both at that number. The number box is held in state so it survives
 * the form resetting while the question is up.
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
  // Edits counted rather than values compared: two boxes, and a position
  // typed as "8.0" is saved as 8.
  const [edits, setEdits] = useState(0);
  const [submitted, setSubmitted] = useState(-1);
  const saved = state.saved && !pending && submitted === edits;
  const taken = state.taken && !pending && submitted === edits ? state.taken : null;
  const [number, setNumber] = useState(position === null ? "" : String(position));

  return (
    <form
      action={action}
      onSubmit={() => setSubmitted(edits)}
      onChange={() => setEdits((n) => n + 1)}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="workId" value={workId} />
      <div className="flex flex-wrap items-start gap-3 font-narrow">
        <NameInput
          label="Series"
          name="series"
          kind="series"
          names={seriesNames}
          examples={EXAMPLES}
          defaultValue={current ?? ""}
          onValueChange={() => setEdits((n) => n + 1)}
        />
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Number</span>
          <input
            name="position"
            inputMode="decimal"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="e.g. 8"
            className={`${FIELD} w-20`}
          />
        </label>
        {/* Level with the boxes, below their labels. */}
        <button type="submit" disabled={pending || saved} aria-pressed={saved} className="btn sm:mt-[1.6rem]">
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {taken ? (
        <div role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-3 font-narrow">
          <p>
            {taken.title} is already #{taken.position} in {taken.series}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="taken" value="shift" className="btn btn-primary">
              Move it and the rest up one
            </button>
            <button type="submit" name="taken" value="keep" className="btn">
              Keep both at #{taken.position}
            </button>
          </div>
        </div>
      ) : state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : saved && current ? (
        <p role="status" className="font-narrow text-ink-dim">
          Clear the name to take it out of the series.
        </p>
      ) : null}
    </form>
  );
}
