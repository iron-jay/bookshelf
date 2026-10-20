"use client";

import { useActionState, useState } from "react";

import { saveCollection, type CollectionState } from "./collection-actions";
import { NameInput } from "./name-input";

const INITIAL: CollectionState = { error: null, saved: false };
/** For a shelf with too few collections of its own to show as examples. */
const EXAMPLES = ["Halo", "Star Wars", "The Cosmere", "Warhammer 40,000"];

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
  // As SeriesForm: "Saved" until the box changes again.
  const [edits, setEdits] = useState(0);
  const [submitted, setSubmitted] = useState(-1);
  const saved = state.saved && !pending && submitted === edits;

  return (
    <form action={action} onSubmit={() => setSubmitted(edits)} className="flex flex-col gap-2">
      <input type="hidden" name="targetKind" value={targetKind} />
      <input type="hidden" name="targetId" value={targetId} />
      <div className="flex flex-wrap items-start gap-3 font-narrow">
        <NameInput
          label={`Collection${note ? ` — ${note}` : ""}`}
          name="collection"
          kind="collection"
          names={names}
          examples={EXAMPLES}
          defaultValue={current ?? ""}
          onValueChange={() => setEdits((n) => n + 1)}
        />
        <button type="submit" disabled={pending || saved} aria-pressed={saved} className="btn sm:mt-[1.6rem]">
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : saved && current ? (
        <p role="status" className="font-narrow text-ink-dim">
          Clear the name to take it out of the collection.
        </p>
      ) : null}
    </form>
  );
}
