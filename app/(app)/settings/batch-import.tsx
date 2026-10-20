"use client";

import { useActionState, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import type { RowOutcome } from "@/lib/import/run";
import { SHELF_LABELS, SHELVES, type Shelf } from "@/lib/shelves";

import { FilePicker } from "../file-picker";
import type { ParseState } from "./import-actions";
import { IMPORT_CHUNK } from "./import-limits";

const BUTTON =
  "w-fit btn";

type Progress = {
  done: number;
  total: number;
  added: number;
  already: number;
  local: number;
  failed: RowOutcome[];
  finished: boolean;
  stopped: boolean;
};

type Row = { line: number; shelf: Shelf };

/**
 * A file read once, then imported in batches of IMPORT_CHUNK from the page,
 * with progress — the Goodreads import and the restore from bookshelf's own
 * export, which differ only in their words and what they read.
 */
export function BatchImport<R extends Row>({
  parse,
  importBatch,
  rowTitle,
  accept,
  pickLabel,
  tooLarge: tooLargeMessage,
  timing,
}: {
  parse: (prev: ParseState<R>, formData: FormData) => Promise<ParseState<R>>;
  importBatch: (rows: R[]) => Promise<RowOutcome[]>;
  rowTitle: (row: R) => string;
  accept: string;
  pickLabel: string;
  tooLarge: string;
  /** How long it takes and what to do if it stops, for this many books. */
  timing: (count: number) => string;
}) {
  const [state, action, reading] = useActionState<ParseState<R>, FormData>(parse, null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const router = useRouter();

  const parsed = state?.ok ? state : null;

  async function run() {
    if (!parsed) return;
    setRunning(true);
    stop.current = false;
    const tally: Progress = {
      done: 0,
      total: parsed.rows.length,
      added: 0,
      already: 0,
      local: 0,
      failed: [],
      finished: false,
      stopped: false,
    };
    setProgress({ ...tally });

    try {
      for (let i = 0; i < parsed.rows.length; i += IMPORT_CHUNK) {
        if (stop.current) {
          tally.stopped = true;
          break;
        }
        const batch = parsed.rows.slice(i, i + IMPORT_CHUNK);
        let outcomes: RowOutcome[];
        try {
          outcomes = await importBatch(batch);
        } catch {
          // The request itself failed (server restarted, connection dropped):
          // those rows are failures to retry, not a reason to abandon the rest.
          outcomes = batch.map((row) => ({
            line: row.line,
            title: rowTitle(row),
            result: "failed" as const,
            message: "The request did not come back.",
          }));
        }
        for (const outcome of outcomes) {
          if (outcome.result === "added") tally.added++;
          else if (outcome.result === "already") tally.already++;
          else tally.failed.push(outcome);
          if (outcome.result === "added" && outcome.matchedBy === "local") tally.local++;
        }
        tally.done += batch.length;
        setProgress({ ...tally });
      }
    } finally {
      tally.finished = true;
      setProgress({ ...tally });
      setRunning(false);
      // The list of books added as local works is read by the page itself.
      router.refresh();
    }
  }

  const shelfCounts = parsed
    ? SHELVES.map((shelf) => [shelf, parsed.rows.filter((row) => row.shelf === shelf).length] as const).filter(
        ([, n]) => n > 0,
      )
    : [];

  return (
    <div className="mt-3 flex max-w-2xl flex-col gap-4">
      <form
        action={action}
        // Checked here as well as on the server: a file past the server's body
        // limit never reaches the server's own check, it just fails.
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("file");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          const big = Boolean(file && file.size > 20 * 1024 * 1024);
          setTooLarge(big);
          if (big) event.preventDefault();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <FilePicker name="file" accept={accept} label={pickLabel} />
        {/* Not disabled until a file is picked: the server answers "choose a
            file" on its own, and a button that depends on a change event
            firing is one more thing to break. */}
        <button type="submit" disabled={reading || running} className={BUTTON}>
          {reading ? "Reading…" : "Read the file"}
        </button>
      </form>

      {tooLarge ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {tooLargeMessage}
        </p>
      ) : state && !state.ok ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      {parsed ? (
        <div className="card font-narrow">
          <p>
            {parsed.rows.length} {parsed.rows.length === 1 ? "book" : "books"}:{" "}
            {shelfCounts.map(([shelf, n]) => `${n} ${SHELF_LABELS[shelf].toLowerCase()}`).join(", ")}.
          </p>
          {parsed.skipped.length > 0 ? (
            <p className="mt-1 text-ink-dim">
              {parsed.skipped.length} {parsed.skipped.length === 1 ? "row is" : "rows are"} skipped (
              {parsed.skipped.slice(0, 5).map((s) => `row ${s.line}: ${s.reason}`).join("; ")}).
            </p>
          ) : null}
          <p className="mt-2 text-ink-dim">{timing(parsed.rows.length)}</p>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => void run()} disabled={running || Boolean(progress?.finished)} className={BUTTON}>
              {running ? "Importing…" : progress?.finished ? "Done" : "Import"}
            </button>
            {running ? (
              <button type="button" onClick={() => (stop.current = true)} className="text-ink-dim underline hover:text-ink">
                Stop after this batch
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {progress ? (
        <div className="card font-narrow tabular-nums">
          <p>
            {progress.done} of {progress.total} · {progress.added} added
            {progress.local > 0 ? ` (${progress.local} as local works)` : ""} · {progress.already} already here
            {progress.failed.length > 0 ? ` · ${progress.failed.length} failed` : ""}
          </p>
          <span
            className="mt-2 block h-px bg-ink-dim"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
          {progress.finished ? (
            <p className="mt-3 text-ink-dim">
              {progress.stopped ? "Stopped. Run the same file again to carry on. " : "Finished. "}
              {progress.failed.length > 0
                ? "Failed rows were not added; running the file again retries them."
                : ""}
            </p>
          ) : null}
          {progress.failed.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-0.5 text-ink-dim">
              {progress.failed.slice(0, 20).map((f) => (
                <li key={`${f.line}-${f.title}`}>
                  Row {f.line}, {f.title}: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
