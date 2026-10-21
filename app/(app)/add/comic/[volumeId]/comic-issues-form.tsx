"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SHELF_LABELS, SHELVES, type Shelf } from "@/lib/shelves";

import { addComicIssues } from "./actions";
import { ISSUE_CHUNK } from "./limits";

export type IssueChoice = {
  id: number;
  label: string;
  year: number | null;
  thumbUrl: string | null;
  onShelf: boolean;
};

type Progress = { done: number; total: number; missed: string[] };

/**
 * Which issues of a run to shelve: one, several, or the whole run read in one
 * go. On Finished the day is asked once for all of them, starting at today.
 * Issues already on your shelf stay as they are, as any add leaves them; the
 * series page finishes those.
 */
export function ComicIssuesForm({
  volumeId,
  issues,
  today,
}: {
  volumeId: number;
  issues: IssueChoice[];
  today: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<number>>(() => {
    const first = issues.find((i) => !i.onShelf);
    return new Set(first ? [first.id] : []);
  });
  const [shelf, setShelf] = useState<Shelf>("tbr");
  const [finishedOn, setFinishedOn] = useState(today);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = progress !== null && progress.done < progress.total;

  function toggle(id: number) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // In the run's own order, so the shelf's "added" order reads like the series.
    const ids = issues.filter((i) => chosen.has(i.id)).map((i) => i.id);
    if (ids.length === 0) {
      setError("Choose which ones to add.");
      return;
    }
    setError(null);
    const tally: Progress = { done: 0, total: ids.length, missed: [] };
    setProgress({ ...tally });

    let seriesSlug: string | null = null;
    let only: { entryId: string; added: boolean } | null = null;
    for (let i = 0; i < ids.length; i += ISSUE_CHUNK) {
      const batch = ids.slice(i, i + ISSUE_CHUNK);
      let result;
      try {
        result = await addComicIssues({ volumeId, issueIds: batch, shelf, finishedOn });
      } catch {
        result = { error: "The server did not answer.", outcomes: [], seriesSlug: null };
      }
      if (result.error) {
        setError(`${result.error}${tally.done > 0 ? ` ${tally.done} were added before it stopped.` : ""}`);
        setProgress(null);
        router.refresh();
        return;
      }
      for (const outcome of result.outcomes) {
        if (outcome.entryId) only = { entryId: outcome.entryId, added: outcome.added };
        else tally.missed.push(issues.find((x) => x.id === outcome.issueId)?.label ?? String(outcome.issueId));
      }
      seriesSlug = result.seriesSlug ?? seriesSlug;
      tally.done += batch.length;
      setProgress({ ...tally });
    }

    if (tally.missed.length > 0) {
      setError(`Comic Vine did not answer for ${tally.missed.join(", ")}. Choose them and add again.`);
      router.refresh();
      return;
    }
    if (ids.length === 1 && only) router.push(`/?${only.added ? "added" : "already"}=${only.entryId}`);
    else router.push(seriesSlug ? `/series/${seriesSlug}` : "/");
  }

  const allOffShelf = issues.filter((i) => !i.onShelf).map((i) => i.id);

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-3xl flex-col gap-6">
      <fieldset>
        <legend className="mb-2 font-narrow text-ink-dim">Which ones</legend>
        <div className="mb-3 flex flex-wrap items-center gap-3 font-narrow">
          <button type="button" className="btn" onClick={() => setChosen(new Set(allOffShelf))} disabled={running}>
            Choose all{allOffShelf.length < issues.length ? " not on your shelf" : ""}
          </button>
          <button type="button" className="btn" onClick={() => setChosen(new Set())} disabled={running}>
            Clear
          </button>
          <span className="text-ink-dim">{chosen.size} chosen</span>
        </div>
        <ul className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
          {issues.map((issue) => (
            <li key={issue.id}>
              <label className="group block cursor-pointer">
                <input
                  type="checkbox"
                  checked={chosen.has(issue.id)}
                  onChange={() => toggle(issue.id)}
                  disabled={running}
                  className="peer sr-only"
                />
                <span className="relative block aspect-[2/3] w-full overflow-hidden border-2 border-transparent bg-panel group-hover:border-line peer-checked:border-ink peer-focus-visible:border-accent">
                  {issue.thumbUrl ? (
                    <Image src={issue.thumbUrl} alt="" fill sizes="160px" className="object-cover" unoptimized />
                  ) : null}
                </span>
                <span className="block truncate font-narrow">{issue.label}</span>
                <span className="block truncate font-narrow text-ink-dim">
                  {[issue.year, issue.onShelf ? "On your shelf" : null].filter(Boolean).join(" · ") || " "}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Shelf</span>
          <select
            name="shelf"
            value={shelf}
            onChange={(e) => setShelf(e.target.value as Shelf)}
            disabled={running}
            className="w-fit field"
          >
            {SHELVES.map((s) => (
              <option key={s} value={s}>
                {SHELF_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {shelf === "finished" ? (
          <label className="flex flex-col gap-1.5">
            <span className="font-narrow text-ink-dim">Finished on</span>
            <input
              type="date"
              value={finishedOn}
              onChange={(e) => setFinishedOn(e.target.value)}
              required
              disabled={running}
              className="field w-48"
            />
          </label>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {error}
        </p>
      ) : null}
      {progress && progress.total > 1 ? (
        <p role="status" className="font-narrow text-ink-dim">
          Added {progress.done} of {progress.total}
          {running ? "…" : "."}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={running} className="w-fit btn btn-primary">
          {running ? "Adding…" : chosen.size > 1 ? `Add ${chosen.size} to shelf` : "Add to shelf"}
        </button>
        {/* Many at once are added as Comic Vine has them; one can be looked
            over and edited first, as any other book is (2026-10-21). */}
        {chosen.size === 1 && !running ? (
          <Link href={`/add/comic/${volumeId}?issue=${[...chosen][0]}`} className="font-narrow text-ink-dim underline hover:text-ink">
            Look over its details first
          </Link>
        ) : null}
      </div>
    </form>
  );
}
