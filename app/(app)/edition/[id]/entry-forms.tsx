"use client";

import { useActionState, useState } from "react";

import { deleteRead, removeFromShelf, saveRead, saveReview, type FormState } from "./actions";

const INITIAL: FormState = { error: null, saved: false };
const BUTTON =
  "w-fit border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";
const FIELD = "border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

function Status({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
        {state.error}
      </p>
    );
  }
  return state.saved ? (
    <p role="status" className="font-narrow text-ink-dim">
      Saved
    </p>
  ) : null;
}

/**
 * The review is written in Newsreader, as it will be read: long-form prose
 * is the one place the serif belongs (§5b).
 */
export function ReviewForm({ editionId, review }: { editionId: string; review: string | null }) {
  const [state, action, pending] = useActionState(saveReview, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="editionId" value={editionId} />
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Review</span>
        <textarea
          name="review"
          defaultValue={review ?? ""}
          rows={8}
          maxLength={50_000}
          className={`${FIELD} max-w-prose font-serif text-lg leading-relaxed`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Saving…" : "Save review"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/**
 * One read, its dates editable in place. Blank is allowed for either: a read
 * with no start is common for anything imported or remembered late.
 */
export function ReadRow({
  readId,
  startedOn,
  finishedOn,
}: {
  readId: string;
  startedOn: string | null;
  finishedOn: string | null;
}) {
  const [state, action, pending] = useActionState(saveRead, INITIAL);

  return (
    <li className="flex flex-col gap-1 border-b border-line py-2">
      <form action={action} className="flex flex-wrap items-end gap-3 font-narrow">
        <input type="hidden" name="readId" value={readId} />
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Started</span>
          <input type="date" name="startedOn" defaultValue={startedOn ?? ""} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-dim">Finished</span>
          <input type="date" name="finishedOn" defaultValue={finishedOn ?? ""} className={FIELD} />
        </label>
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="submit" formAction={deleteRead} className="text-ink-dim underline hover:text-ink">
          Delete read
        </button>
      </form>
      <Status state={state} />
    </li>
  );
}

/**
 * Two steps, because it takes the rating, review and every read with it.
 * Plain text rather than a warning colour: --label is the only chromatic value
 * and it means fan translation, nothing else.
 */
export function RemoveFromShelf({ editionId }: { editionId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-narrow text-ink-dim underline hover:text-ink"
      >
        Remove from shelf
      </button>
    );
  }

  return (
    <form action={removeFromShelf} className="flex flex-wrap items-center gap-3 font-narrow">
      <input type="hidden" name="editionId" value={editionId} />
      <span>Remove it, with its rating, review and reads?</span>
      <button type="submit" className={BUTTON}>
        Remove
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-ink-dim underline hover:text-ink">
        Keep it
      </button>
    </form>
  );
}
