"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type Scope = "work" | "edition";

/**
 * The book or just this edition. The whole book is the default (Jay,
 * 2026-10-20); a book with one edition has no choice to make, so the switch
 * is not shown.
 */
export function DeleteChoice({
  action,
  editionId,
  workTitle,
  workSummary,
  editionSummary,
  keepHref,
}: {
  action: (formData: FormData) => Promise<void>;
  editionId: string;
  workTitle: string;
  workSummary: ReactNode;
  editionSummary: ReactNode | null;
  keepHref: string;
}) {
  const [scope, setScope] = useState<Scope>("work");

  return (
    <form action={action}>
      <input type="hidden" name="editionId" value={editionId} />
      <input type="hidden" name="scope" value={scope} />

      <h1 className="mb-4 font-display text-3xl">
        {scope === "work" ? `Delete ${workTitle}?` : "Delete this edition?"}
      </h1>

      {editionSummary !== null ? (
        <div className="segmented mb-5 max-w-md" role="group" aria-label="What to delete">
          <button type="button" aria-pressed={scope === "work"} onClick={() => setScope("work")}>
            The whole book
          </button>
          <button type="button" aria-pressed={scope === "edition"} onClick={() => setScope("edition")}>
            Just this edition
          </button>
        </div>
      ) : null}

      {scope === "work" ? workSummary : editionSummary}

      <div className="mt-6 flex items-center gap-4">
        <button type="submit" className="btn btn-danger">
          {scope === "work" ? "Delete the book" : "Delete this edition"}
        </button>
        <Link href={keepHref} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </div>
    </form>
  );
}
