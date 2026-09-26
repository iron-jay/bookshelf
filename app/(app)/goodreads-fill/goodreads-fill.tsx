"use client";

import { useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import { applyGoodreads, previewGoodreads, type Preview } from "./actions";

const GOODREADS = "https://www.goodreads.com";
const BUTTON =
  "w-fit border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim";

/**
 * Receives a Goodreads book page's details from the bookmarklet (lib/
 * goodreads-bookmarklet) and fills in the matching book. Only messages from
 * Goodreads' own origin are read; nothing is written until Apply.
 */
export function GoodreadsFill() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ filled: string[]; editionId: string } | { error: string } | null>(null);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== GOODREADS) return;
      const data = event.data as { type?: string; book?: unknown } | null;
      if (data?.type !== "bookshelf-goodreads") return;
      setWaiting(false);
      void previewGoodreads(data.book).then(setPreview);
    }
    window.addEventListener("message", receive);
    // Tell the Goodreads tab this page is ready for the data; only it may hear.
    window.opener?.postMessage("bookshelf-ready", GOODREADS);
    const timer = setTimeout(() => setWaiting(false), 4000);
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(timer);
    };
  }, []);

  if (!preview) {
    return waiting ? (
      <p className="font-narrow text-ink-dim">Waiting for the Goodreads page…</p>
    ) : (
      <div className="flex max-w-xl flex-col gap-2 font-narrow text-ink-dim">
        <p>Nothing arrived from Goodreads.</p>
        <p>
          This page is opened by the Goodreads bookmarklet: on a book’s Goodreads page, click the bookmark. Set
          it up in <Link href="/settings" className="underline hover:text-ink">Settings</Link>.
        </p>
      </div>
    );
  }

  if ("error" in preview) {
    return <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">{preview.error}</p>;
  }

  const { data, target } = preview;
  const fills = target
    ? ([
        ["description", target.missing.description && data.description],
        ["year", target.missing.year && data.year],
        ["series", target.missing.series && data.series],
        ["cover", (target.missing.cover || target.coverNeedsReview || replace) && data.coverUrl],
      ] as const).filter(([, on]) => Boolean(on)).map(([what]) => what)
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="flex gap-4">
        <div className="relative aspect-[2/3] w-28 shrink-0 bg-panel">
          {data.coverUrl ? (
            <Image src={data.coverUrl} alt="" fill sizes="112px" className="object-cover" unoptimized />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-narrow text-ink-dim">From Goodreads</p>
          <p className="text-lg font-medium">{data.title ?? "Untitled"}</p>
          <p className="font-narrow text-ink-dim">
            {[data.series ? `${data.series}${data.position ? ` #${data.position}` : ""}` : null, data.year]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {data.description ? (
            <p className="line-clamp-4 max-w-prose font-serif leading-relaxed">{data.description}</p>
          ) : null}
        </div>
      </section>

      {!target ? (
        <p className="border-l-2 border-ink-dim pl-3 font-narrow">
          No book on your shelf has Goodreads id <span className="font-mono">{data.goodreadsId}</span>. This works for
          books that came in through the Goodreads import.
        </p>
      ) : done ? (
        "error" in done ? (
          <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">{done.error}</p>
        ) : (
          <p role="status" className="font-narrow">
            {done.filled.length ? `Filled in: ${done.filled.join(", ")}.` : "Nothing was empty, so nothing changed."}{" "}
            <Link href={`/edition/${done.editionId}`} className="underline hover:text-ink">
              Open {target.workTitle}
            </Link>
          </p>
        )
      ) : (
        <section className="flex flex-col gap-3 font-narrow">
          <p>
            For <span className="text-ink">{target.workTitle}</span>
            <span className="text-ink-dim"> — {target.editionName}</span>
          </p>
          <p className="text-ink-dim">
            {fills.length
              ? `Will fill: ${fills.join(", ")}. Anything already filled in is kept.`
              : "Everything this page has is already filled in."}
          </p>
          {!target.missing.cover && !target.coverNeedsReview && data.coverUrl ? (
            <label className="flex items-center gap-2 text-ink-dim">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace the current cover with this one
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy || fills.length === 0}
            onClick={() => {
              setBusy(true);
              void applyGoodreads(data, replace)
                .then(setDone)
                .finally(() => setBusy(false));
            }}
            className={BUTTON}
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        </section>
      )}
    </div>
  );
}
