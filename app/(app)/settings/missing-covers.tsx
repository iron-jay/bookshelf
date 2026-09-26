"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { COVER_CHUNK } from "./import-limits";
import { findMissingCoversBatch, listMissingCovers, type MissingCoverOutcome } from "./missing-cover-actions";

const BUTTON =
  "w-fit border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim";

type Progress = { done: number; total: number; found: number; review: number; none: number; stopped: boolean; finished: boolean };

/**
 * The manual cover refresh (§4a), for every placeholder at once — worth having
 * after adding a Google Books key, or after an import that ran before one.
 * Same page-driven batches as the import: progress, Stop, and a second run
 * simply retries what is still missing.
 */
export function MissingCovers({ missing }: { missing: number }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [misses, setMisses] = useState<MissingCoverOutcome[]>([]);
  const stop = useRef(false);
  const router = useRouter();

  async function run() {
    setRunning(true);
    stop.current = false;
    setMisses([]);
    const list = await listMissingCovers();
    const tally: Progress = { done: 0, total: list.length, found: 0, review: 0, none: 0, stopped: false, finished: false };
    setProgress({ ...tally });
    const stillMissing: MissingCoverOutcome[] = [];

    try {
      for (let i = 0; i < list.length; i += COVER_CHUNK) {
        if (stop.current) {
          tally.stopped = true;
          break;
        }
        const batch = list.slice(i, i + COVER_CHUNK);
        let outcomes: MissingCoverOutcome[];
        try {
          outcomes = await findMissingCoversBatch(batch.map((b) => b.editionId));
        } catch {
          outcomes = batch.map((b) => ({ ...b, result: "none" as const }));
        }
        for (const o of outcomes) {
          if (o.result === "found") tally.found++;
          else if (o.result === "review") tally.review++;
          else if (o.result === "none") {
            tally.none++;
            stillMissing.push(o);
          }
        }
        tally.done += batch.length;
        setProgress({ ...tally });
      }
    } finally {
      tally.finished = true;
      setProgress({ ...tally });
      setMisses(stillMissing);
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 font-narrow">
      <p className="text-ink-dim">
        {missing === 0
          ? "Every book on your shelf that can have a looked-up cover has one."
          : `${missing} ${missing === 1 ? "book shows" : "books show"} the typeset cover. Fan translations are not counted: nothing is looked up for them.`}
      </p>
      {missing > 0 || progress ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void run()} disabled={running} className={BUTTON}>
            {running ? "Looking…" : "Find missing covers"}
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
            {progress.done} of {progress.total} · {progress.found} found · {progress.review} to review ·{" "}
            {progress.none} not found
          </p>
          <span
            className="mt-2 block h-px bg-ink-dim"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
          {progress.finished ? (
            <p className="mt-3 text-ink-dim">
              {progress.stopped ? "Stopped; run it again to carry on. " : "Finished. "}
              {progress.review > 0 ? (
                <>
                  Covers found by title may be the wrong book —{" "}
                  <Link href="/art" className="underline hover:text-ink">
                    review them
                  </Link>
                  .{" "}
                </>
              ) : null}
              {progress.none > 0 ? "The rest keep the typeset cover; upload one from the book’s page if you like." : ""}
            </p>
          ) : null}
          {misses.length > 0 ? (
            <details className="mt-2 text-ink-dim">
              <summary className="cursor-pointer hover:text-ink">Not found ({misses.length})</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {misses.map((m) => (
                  <li key={m.editionId}>
                    <Link href={`/edition/${m.editionId}`} className="hover:text-ink">
                      {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
