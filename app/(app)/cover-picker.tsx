"use client";

import { useActionState, useEffect, useState } from "react";

import Image from "next/image";

import type { CoverCandidate } from "@/lib/books/cover-candidates";

import { applyCoverCandidate, listCoverCandidates, searchCoverCandidates, type CoverState } from "./cover-actions";

const BUTTON =
  "w-fit border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";

/**
 * Pick a cover from what the lookups can see, as gameshelf's art picker does,
 * rather than taking the first hit. Loaded as the cover page opens: finding
 * them is several queued requests, which is what that page is for.
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

  useEffect(() => {
    let live = true;
    void listCoverCandidates(kind, id).then((found) => {
      if (live) setCandidates(found);
    });
    return () => {
      live = false;
    };
  }, [kind, id]);

  if (candidates === null) {
    return <p className="text-ink-dim">Looking for covers… this takes a few seconds.</p>;
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
        <ul className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
          {candidates.map((c) => {
            const selected = chosen?.source === c.source && chosen.ref === c.ref;
            return (
              <li key={`${c.source}-${c.ref}`}>
                <button
                  type="button"
                  onClick={() => setChosen(selected ? null : c)}
                  aria-pressed={selected}
                  title={c.label}
                  className={`relative block aspect-[2/3] w-full overflow-hidden border-2 bg-panel ${selected ? "border-ink" : "border-transparent hover:border-line"}`}
                >
                  <Image
                    src={c.thumb}
                    alt={c.label}
                    fill
                    sizes="160px"
                    className="object-cover"
                    // Candidates are other sites' images, mostly never chosen:
                    // shown straight from there, not optimised or stored.
                    unoptimized
                  />
                </button>
                <p className="truncate text-ink-dim" title={c.label}>{c.label}</p>
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
