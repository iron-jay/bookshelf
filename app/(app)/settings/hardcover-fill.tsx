"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { fillFromHardcoverBatch, listHardcoverCandidates, type FillOutcome } from "./hardcover-actions";
import { COVER_CHUNK } from "./import-limits";

const BUTTON =
  "w-fit border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim";

type Progress = { done: number; total: number; filled: number; none: number; stopped: boolean; finished: boolean };

/**
 * Fill in books Open Library does not have — descriptions, years, series,
 * covers — from Hardcover, for works that arrived before a token was set (an
 * earlier Goodreads import, a book added by hand). Same page-driven batches as
 * the import and the cover run.
 */
export function HardcoverFill({ pending }: { pending: number }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [notFound, setNotFound] = useState<FillOutcome[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const stop = useRef(false);
  const router = useRouter();

  async function run() {
    setRunning(true);
    stop.current = false;
    setNotFound([]);
    const list = await listHardcoverCandidates();
    const tally: Progress = { done: 0, total: list.length, filled: 0, none: 0, stopped: false, finished: false };
    const added: Record<string, number> = {};
    const missed: FillOutcome[] = [];
    setProgress({ ...tally });
    try {
      for (let i = 0; i < list.length; i += COVER_CHUNK) {
        if (stop.current) {
          tally.stopped = true;
          break;
        }
        const batch = list.slice(i, i + COVER_CHUNK);
        let outcomes: FillOutcome[];
        try {
          outcomes = await fillFromHardcoverBatch(batch.map((b) => b.workId));
        } catch {
          outcomes = batch.map((b) => ({ ...b, result: "none" as const }));
        }
        for (const o of outcomes) {
          if (o.result === "filled") {
            tally.filled++;
            for (const what of o.added) added[what] = (added[what] ?? 0) + 1;
          } else if (o.result === "none") {
            tally.none++;
            missed.push(o);
          }
        }
        tally.done += batch.length;
        setProgress({ ...tally });
        setCounts({ ...added });
      }
    } finally {
      tally.finished = true;
      setProgress({ ...tally });
      setNotFound(missed);
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 font-narrow">
      <p className="text-ink-dim">
        {pending === 0
          ? "Every book Open Library lacks has been looked up on Hardcover."
          : `${pending} ${pending === 1 ? "book" : "books"} Open Library does not have can be looked up on Hardcover: description, year, series and cover, filling only what is empty.`}
      </p>
      {pending > 0 || progress ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void run()} disabled={running} className={BUTTON}>
            {running ? "Looking…" : "Fill in from Hardcover"}
          </button>
          {running ? (
            <button type="button" onClick={() => (stop.current = true)} className="text-ink-dim underline hover:text-ink">
              Stop after this batch
            </button>
          ) : null}
        </div>
      ) : null}
      {progress ? (
        <div className="border border-line p-4 tabular-nums">
          <p>
            {progress.done} of {progress.total} · {progress.filled} filled in · {progress.none} not on Hardcover
          </p>
          <span
            className="mt-2 block h-px bg-ink-dim"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
          {Object.keys(counts).length > 0 ? (
            <p className="mt-2 text-ink-dim">
              Added: {Object.entries(counts).map(([what, n]) => `${n} ${what === "series" ? "series" : what + (n === 1 ? "" : "s")}`).join(", ")}.
            </p>
          ) : null}
          {progress.finished ? (
            <p className="mt-2 text-ink-dim">
              {progress.stopped ? "Stopped; run it again to carry on." : "Finished."}
            </p>
          ) : null}
          {notFound.length > 0 ? (
            <details className="mt-2 text-ink-dim">
              <summary className="cursor-pointer hover:text-ink">Not on Hardcover ({notFound.length})</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {notFound.map((m) => (
                  <li key={m.workId}>{m.title}</li>
                ))}
              </ul>
              <p className="mt-2">
                For these, open the book and paste a cover address — imported books link to their Goodreads
                page. <Link href="/art" className="underline hover:text-ink">Cover review</Link> lists any
                cover found only by title.
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
