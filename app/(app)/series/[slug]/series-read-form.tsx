"use client";

import { useActionState } from "react";

import { finishSeries, type SeriesReadState } from "./actions";

const INITIAL: SeriesReadState = { error: null, done: null };

/**
 * "I read the whole run": every book in the series to Finished on one day.
 * The day is asked for here, unlike a single Finished click, because a run
 * is usually logged after the fact; it starts at today and stays editable on
 * each book afterwards.
 */
export function SeriesReadForm({ seriesId, today, left }: { seriesId: string; today: string; left: number }) {
  const [state, action, pending] = useActionState(finishSeries, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />
      <div className="flex flex-wrap items-end gap-3 font-narrow">
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Read the whole series — finished on</span>
          <input type="date" name="finishedOn" defaultValue={today} required className="field w-48" />
        </label>
        <button type="submit" disabled={pending} className="btn">
          {pending ? "Marking…" : left === 1 ? "Mark the last one finished" : `Mark all ${left} finished`}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="font-narrow text-ink-dim">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
