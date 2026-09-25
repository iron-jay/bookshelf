"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { findSourceWorks } from "./actions";
import type { SourceResult } from "./source-types";

export type SourceChoice =
  | Extract<SourceResult, { kind: "local" }>
  | Extract<SourceResult, { kind: "openlibrary" }>
  | { kind: "new" };

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/**
 * "What is this a translation of?" — searched inline, works already here
 * first, then Open Library. When it is neither (a web novel nobody has
 * catalogued), "Not listed" turns the search into title and author fields and
 * the same submit creates the work too.
 *
 * Emits the hidden fields the action reads (workId, olWorkKey, or title and
 * authors), so the form above never has to know which of the three it got.
 */
export function SourcePicker({
  choice,
  onChoose,
}: {
  choice: SourceChoice | null;
  onChoose: (choice: SourceChoice | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [searched, setSearched] = useState("");
  const [pending, startSearch] = useTransition();
  const latest = useRef("");

  // Debounced, and only the newest answer is kept: Open Library answers in a
  // second or two, and an early slow reply must not overwrite a later one.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = setTimeout(() => {
      latest.current = term;
      startSearch(async () => {
        const answer = await findSourceWorks(term);
        if (latest.current !== term) return;
        setResults(answer.results);
        setRemoteFailed(answer.remoteFailed);
        setSearched(term);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  if (choice && choice.kind !== "new") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Translation of</span>
        {choice.kind === "local" ? (
          <input type="hidden" name="workId" value={choice.workId} />
        ) : (
          <input type="hidden" name="olWorkKey" value={choice.olWorkKey} />
        )}
        <div className="flex items-baseline gap-3">
          <p>
            {choice.title}
            {choice.year ? <span className="ml-2 text-ink-dim">{choice.year}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="font-narrow text-ink-dim underline hover:text-ink"
          >
            Change
          </button>
        </div>
        {choice.authors.length > 0 ? (
          <p className="font-narrow text-ink-dim">{choice.authors.join(", ")}</p>
        ) : null}
      </div>
    );
  }

  if (choice?.kind === "new") {
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 font-narrow text-ink-dim">
          Translation of — a book not on Open Library{" "}
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="ml-2 underline hover:text-ink"
          >
            Search instead
          </button>
        </legend>
        <WorkFields defaultTitle={query.trim()} />
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Translation of</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your books and Open Library"
          className={`${FIELD} max-w-md`}
        />
      </label>

      {pending ? <p className="font-narrow text-ink-dim">Searching…</p> : null}
      {remoteFailed && !pending ? (
        <p className="font-narrow text-ink-dim">
          Open Library did not answer; only books on this server are listed.
        </p>
      ) : null}

      {searched && !pending ? (
        <ul className="max-w-2xl border-y border-line">
          {results.map((result) => (
            <li key={result.kind === "local" ? result.workId : result.olWorkKey}>
              <button
                type="button"
                onClick={() => onChoose(result)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-panel"
              >
                <span>
                  {result.title}
                  {result.year ? <span className="ml-2 text-ink-dim">{result.year}</span> : null}
                </span>
                <span className="font-narrow text-ink-dim">
                  {[result.authors.join(", "), result.kind === "local" ? "On this server" : "Open Library"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onChoose({ kind: "new" })}
              className="w-full px-3 py-2 text-left font-narrow text-ink-dim hover:bg-panel hover:text-ink"
            >
              {results.length ? "Not listed" : `Nothing found for “${searched}”`} — add it as a new
              book
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** Title and authors for a work created on the spot. Shared with the manual book path. */
export function WorkFields({ defaultTitle = "" }: { defaultTitle?: string }) {
  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex min-w-64 flex-[2] flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Title</span>
        <input name="title" required defaultValue={defaultTitle} maxLength={500} className={FIELD} />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Author, or authors separated by commas</span>
        <input name="authors" maxLength={1000} className={FIELD} />
      </label>
    </div>
  );
}
