"use client";

import { useActionState, useState } from "react";

import Image from "next/image";

import type { CoverCandidate } from "@/lib/books/cover-candidates";

import { applyCoverCandidate, listCoverCandidates, searchCoverCandidates, type CoverState } from "./cover-actions";

const BUTTON =
  "w-fit border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";

/**
 * Pick a cover from what the lookups can see, as gameshelf's art picker does,
 * rather than taking the first hit. Loaded on demand: finding the candidates
 * is several queued requests, and most visits to a page do not want them.
 */
export function CoverPicker({ kind, id, seedTerm }: { kind: "work" | "edition"; id: string; seedTerm: string }) {
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState(seedTerm);
  const [chosen, setChosen] = useState<CoverCandidate | null>(null);
  const [state, apply, applying] = useActionState<CoverState, FormData>(applyCoverCandidate, null);

  async function load(fetcher: () => Promise<CoverCandidate[]>) {
    setLoading(true);
    setChosen(null);
    try {
      setCandidates(await fetcher());
    } finally {
      setLoading(false);
    }
  }

  if (candidates === null) {
    return (
      <button type="button" disabled={loading} onClick={() => void load(() => listCoverCandidates(kind, id))} className={BUTTON}>
        {loading ? "Looking…" : "Choose from covers found"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(() => searchCoverCandidates(term));
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search for covers"
          className="w-64 border border-line bg-ground px-3 py-1.5 text-ink outline-none focus:border-ink-dim"
        />
        <button type="submit" disabled={loading} className={BUTTON}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {loading ? null : candidates.length === 0 ? (
        <p className="text-ink-dim">Nothing found. Try another search, or upload one.</p>
      ) : (
        <ul className="grid max-w-md grid-cols-4 gap-1">
          {candidates.map((c) => {
            const selected = chosen?.source === c.source && chosen.ref === c.ref;
            return (
              <li key={`${c.source}-${c.ref}`}>
                <button
                  type="button"
                  onClick={() => setChosen(selected ? null : c)}
                  aria-pressed={selected}
                  title={c.label}
                  className={`relative block aspect-[2/3] w-full overflow-hidden border bg-panel ${selected ? "border-ink" : "border-line"}`}
                >
                  <Image
                    src={c.thumb}
                    alt={c.label}
                    fill
                    sizes="96px"
                    className="object-cover"
                    // Candidates are other sites' images, mostly never chosen:
                    // shown straight from there, not optimised or stored.
                    unoptimized
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form action={apply} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="targetKind" value={kind} />
        <input type="hidden" name="targetId" value={id} />
        <input type="hidden" name="source" value={chosen?.source ?? ""} />
        <input type="hidden" name="ref" value={chosen?.ref ?? ""} />
        <button type="submit" disabled={!chosen || applying} className={BUTTON}>
          {applying ? "Applying…" : "Use this cover"}
        </button>
        {chosen ? <span className="text-ink-dim">{chosen.label}</span> : null}
      </form>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-ink-dim" : "border-l-2 border-ink-dim pl-3"}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
