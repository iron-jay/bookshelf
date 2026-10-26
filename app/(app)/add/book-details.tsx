"use client";

import { useEffect, useState } from "react";

import type { BookDraft } from "@/lib/books/draft";

import { latestPosition } from "./actions";
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
 *
 * "Latest" puts the book at the end of its series (Jay, 2026-10-26: "otherwise
 * you need to look it up"). The number shown beside it is a preview; the
 * server works it out again on Add.
 */
export function BookDetails({ draft, seriesNames }: { draft: BookDraft; seriesNames: string[] }) {
  const [name, setName] = useState(draft.series?.name ?? "");
  const [latest, setLatest] = useState(draft.series?.position === "latest");
  const [next, setNext] = useState<{ name: string; position: number } | null>(null);

  useEffect(() => {
    if (!latest || !name.trim()) return;
    let current = true;
    // Typing a name should not ask the server once a keystroke.
    const timer = setTimeout(() => {
      latestPosition(name).then(
        (position) => current && setNext({ name, position }),
        () => undefined,
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [latest, name]);

  const preview = latest && next?.name === name ? next.position : null;

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
            onValueChange={setName}
          />
          <label className="flex flex-col gap-1">
            <span className="text-ink-dim">Number</span>
            {/* Disabled, so it is not sent; the tickbox is. */}
            <input
              name="position"
              inputMode="decimal"
              defaultValue={typeof draft.series?.position === "number" ? draft.series.position : ""}
              placeholder={latest ? (preview !== null ? String(preview) : "") : "e.g. 8"}
              disabled={latest}
              className="field w-20 disabled:opacity-60"
            />
          </label>
          {/* Level with the boxes, below their labels. */}
          <label className="flex items-center gap-2 text-ink-dim sm:mt-[1.6rem] sm:h-10">
            <input
              type="checkbox"
              name="latest"
              checked={latest}
              onChange={(event) => setLatest(event.target.checked)}
            />
            Latest
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
