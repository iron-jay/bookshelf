"use client";

import Link from "next/link";
import { useActionState } from "react";

import { renameSeriesAction, type RenameState } from "./actions";

const INITIAL: RenameState = { error: null };

/**
 * The series' name, with Remove beside it. A name already here joins the two,
 * as typing it in a book's series box would.
 */
export function RenameForm({ seriesId, slug, name }: { seriesId: string; slug: string; name: string }) {
  const [state, action, pending] = useActionState(renameSeriesAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex w-64 flex-col gap-1 font-narrow">
          <span className="text-ink-dim">Name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={name}
            className="field"
          />
        </label>
        <button type="submit" disabled={pending} className="btn">
          {pending ? "Renaming…" : "Rename"}
        </button>
        <Link
          href={`/series/${slug}/remove`}
          className="py-2 font-narrow text-ink-dim underline underline-offset-4 hover:text-danger"
        >
          Remove the series
        </Link>
      </div>
      {state.error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
