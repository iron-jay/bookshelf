"use client";

import { useActionState } from "react";

import { saveCollection, type CollectionState } from "./collection-actions";

const INITIAL: CollectionState = { error: null, saved: false };
const FIELD = "field";

/**
 * Which collection a series or a book is in. The names already here are
 * offered as you type, so joining Halo is picking it rather than retyping it.
 */
export function CollectionForm({
  targetKind,
  targetId,
  current,
  names,
  note,
}: {
  targetKind: "series" | "work";
  targetId: string;
  current: string | null;
  names: string[];
  /** Says what the setting covers, when that is more than this page: "for all of Forerunner". */
  note?: string | null;
}) {
  const [state, action, pending] = useActionState(saveCollection, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="targetKind" value={targetKind} />
      <input type="hidden" name="targetId" value={targetId} />
      <div className="flex flex-wrap items-end gap-3 font-narrow">
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Collection{note ? ` — ${note}` : ""}</span>
          <input
            name="collection"
            list={`collection-names-${targetId}`}
            defaultValue={current ?? ""}
            placeholder="Not in a collection"
            maxLength={200}
            className={`${FIELD} w-64`}
          />
          <datalist id={`collection-names-${targetId}`}>
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn"
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
          Saved. Clear the name to take it out of the collection.
        </p>
      ) : null}
    </form>
  );
}
