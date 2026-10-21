"use client";

import type { BookDraft } from "@/lib/books/draft";

import { WorkFields } from "../edit-fields";
import { NameInput } from "../name-input";

/** For a shelf with too few series of its own to show as examples. */
const EXAMPLES = ["Discworld", "The Expanse", "Earthsea", "The Murderbot Diaries", "Wayward Children"];

/**
 * A new book's details on the add form, to put right before anything is
 * saved (Jay, 2026-10-21): the edit page's fields, filled in from the
 * catalogue, and its series. A book already here shows none of this; its
 * own details stand, and its Edit details page changes them.
 *
 * A comic run's series is its Comic Vine volume's, so it is not asked.
 */
export function BookDetails({ draft, seriesNames }: { draft: BookDraft; seriesNames: string[] }) {
  return (
    <div className="flex flex-col gap-4 font-narrow">
      <WorkFields work={draft} heading="Details" />
      {draft.series !== undefined ? (
        <div className="flex flex-wrap items-start gap-3">
          <NameInput
            label="Series"
            name="series"
            kind="series"
            names={seriesNames}
            examples={EXAMPLES}
            defaultValue={draft.series?.name ?? ""}
          />
          <label className="flex flex-col gap-1">
            <span className="text-ink-dim">Number</span>
            <input
              name="position"
              inputMode="decimal"
              defaultValue={draft.series?.position ?? ""}
              placeholder="e.g. 8"
              className="field w-20"
            />
          </label>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-ink-dim">
        <input type="checkbox" name="then" value="cover" />
        Choose a different cover after adding
      </label>
    </div>
  );
}
