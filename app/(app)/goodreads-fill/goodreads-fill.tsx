"use client";

import { useEffect, useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import type { GoodreadsAddPreview } from "@/lib/books/add-from-goodreads";
import type { FillCandidate } from "@/lib/books/goodreads-fill";
import type { GoodreadsPageData } from "@/lib/goodreads-bookmarklet";

import { addFromGoodreads } from "../add/actions";
import { CatalogueAddForm } from "../add/catalogue-add-form";
import type { Format } from "../add/format";
import { applyGoodreads, previewGoodreads, previewGoodreadsAddition, type Preview } from "./actions";

const GOODREADS = "https://www.goodreads.com";
const BUTTON =
  "w-fit btn btn-primary";

/**
 * Receives a Goodreads book page's details from the bookmarklet (lib/
 * goodreads-bookmarklet) or the Firefox extension (extension/) and fills in
 * the matching book — the one with that Goodreads id. When none has it, the
 * book is offered to add, its details to look over first (2026-10-25), or
 * one already here to pick and fill. Only messages from Goodreads' own origin
 * are read; nothing is written until Apply or Add.
 */
export function GoodreadsFill({ rememberedFormat }: { rememberedFormat: Format }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  // Kept once a book is picked, so "choose a different book" goes back to it.
  const [candidates, setCandidates] = useState<FillCandidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
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
      void previewGoodreads(data.book).then((p) => {
        setPreview(p);
        if (!("error" in p) && p.candidates) setCandidates(p.candidates);
      });
    }
    window.addEventListener("message", receive);
    // Tell the Goodreads tab this page is ready for the data; only it may hear.
    window.opener?.postMessage("bookshelf-ready", GOODREADS);

    // Or, where the new tab was blocked (phones), the details came in this
    // page's fragment. Unlike a message, that is not proven to come from
    // Goodreads — anyone could make such a link — but it is checked on the
    // server like any other, only shown until Apply, and its cover can only
    // be on Goodreads' own image hosts.
    if (window.location.hash.startsWith("#book=")) {
      let book: unknown = null;
      try {
        book = JSON.parse(decodeURIComponent(window.location.hash.slice("#book=".length)));
      } catch {}
      // Off the address, so a reload or a shared link does not carry it.
      history.replaceState(null, "", window.location.pathname);
      void previewGoodreads(book).then((p) => {
        setWaiting(false);
        setPreview(p);
        if (!("error" in p) && p.candidates) setCandidates(p.candidates);
      });
    }
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
          This page is opened from a book’s Goodreads page, by the Firefox extension’s “Add to bookshelf” or by
          the bookmarklet. Set either up in <Link href="/settings" className="underline hover:text-ink">Settings</Link>.
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
        ["Goodreads link", picked !== null && target.goodreadsBookId === null],
        ["description", target.missing.description && data.description],
        ["year", target.missing.year && data.year],
        ["series", target.missing.series && data.series],
        ["cover", (target.missing.cover || target.coverNeedsReview || replace) && data.coverUrl],
      ] as const).filter(([, on]) => Boolean(on)).map(([what]) => what)
    : [];

  function pick(editionId: string | null) {
    setDone(null);
    setReplace(false);
    setPicked(editionId);
    if (editionId === null) {
      setPreview({ data, target: null, candidates: candidates ?? [] });
      return;
    }
    setBusy(true);
    void previewGoodreads(data, editionId)
      .then(setPreview)
      .finally(() => setBusy(false));
  }

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
        <AddOrPick data={data} rememberedFormat={rememberedFormat} onPick={pick}>
          <Picker candidates={preview.candidates} goodreadsId={data.goodreadsId} busy={busy} onPick={pick} />
        </AddOrPick>
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
            {picked !== null ? (
              <>
                {" "}
                <button type="button" onClick={() => pick(null)} className="text-ink-dim underline hover:text-ink">
                  Choose a different book
                </button>
              </>
            ) : null}
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
              void applyGoodreads(data, replace, picked ?? undefined)
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

const MATCH: Record<Extract<GoodreadsAddPreview, { kind: "add" }>["match"], string> = {
  here: "This edition is here already, not on your shelf.",
  isbn: "Found on Open Library by its ISBN.",
  title: "Found on Open Library by title and author.",
  hardcover: "Not on Open Library; Hardcover has it, so it will be a book of its own with Hardcover’s details.",
  local: "Neither Open Library nor Hardcover has it, so it will be a book of its own.",
};

/**
 * No book of yours has the page's Goodreads id. Most often it is a book to
 * add, so that comes first, found as the Goodreads import finds books; the
 * picker is there for one already here under another edition or title.
 */
function AddOrPick({
  data,
  rememberedFormat,
  onPick,
  children,
}: {
  data: GoodreadsPageData;
  rememberedFormat: Format;
  onPick: (editionId: string) => void;
  children: React.ReactNode;
}) {
  const [found, setFound] = useState<{ preview: GoodreadsAddPreview; seriesNames: string[] } | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void previewGoodreadsAddition(data).then(setFound);
  }, [data]);

  if (picking) {
    return (
      <div className="flex flex-col gap-3">
        {children}
        <button type="button" onClick={() => setPicking(false)} className="w-fit font-narrow text-ink-dim underline hover:text-ink">
          Add it as a new book instead
        </button>
      </div>
    );
  }

  const preview = found?.preview;
  return (
    <div className="flex flex-col gap-6">
      {!preview ? (
        <p className="font-narrow text-ink-dim">Looking for it on Open Library…</p>
      ) : preview.kind === "error" ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">{preview.error}</p>
      ) : preview.kind === "shelved" ? (
        <section className="flex flex-col gap-3 font-narrow">
          <p>
            <span className="text-ink">{preview.target.workTitle}</span>
            <span className="text-ink-dim"> — {preview.target.editionName}</span> has this page’s ISBN and is on your
            shelf already.
          </p>
          <button type="button" onClick={() => onPick(preview.target.editionId)} className="w-fit btn btn-primary">
            Fill it in from this page
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="font-narrow">
            <h2 className="font-display text-xl">Add it to your shelf</h2>
            <p className="text-ink-dim">
              {MATCH[preview.match]}
              {preview.workTitle ? ` It goes on your shelf as ${preview.workTitle}, whose details stay as they are.` : null}
            </p>
          </div>
          <CatalogueAddForm
            action={addFromGoodreads}
            hidden={{ goodreads: JSON.stringify(data) }}
            withFormat
            defaultFormat={data.format ?? rememberedFormat}
            draft={preview.draft}
            seriesNames={found.seriesNames}
          />
        </section>
      )}
      <p className="font-narrow text-ink-dim">
        On your shelf already, under another edition or title?{" "}
        <button type="button" onClick={() => setPicking(true)} className="underline hover:text-ink">
          Choose it to fill in instead
        </button>
      </p>
    </div>
  );
}

/** A page that shows at most this many books; the filter narrows the rest. */
const SHOWN = 60;

/**
 * No book has the page's Goodreads id: choose one. Books with no cover (or one
 * waiting for review) come first and are all that shows until "all books";
 * the server has already put titles like the page's at the top.
 */
function Picker({
  candidates,
  goodreadsId,
  busy,
  onPick,
}: {
  candidates: FillCandidate[];
  goodreadsId: number;
  busy: boolean;
  onPick: (editionId: string) => void;
}) {
  const needing = candidates.filter((c) => c.cover !== "ok").length;
  const [all, setAll] = useState(needing === 0);
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return candidates.filter(
      (c) =>
        (all || c.cover !== "ok") &&
        (!q || c.title.toLowerCase().includes(q) || c.authors.some((a) => a.toLowerCase().includes(q))),
    );
  }, [candidates, all, filter]);

  if (candidates.length === 0) {
    return (
      <p className="border-l-2 border-ink-dim pl-3 font-narrow">
        No book on your shelf has Goodreads id <span className="font-mono">{goodreadsId}</span>, and there is nothing on
        your shelf to fill in instead.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 font-narrow">
      <p>
        No book on your shelf has Goodreads id <span className="font-mono">{goodreadsId}</span>. Which one is it? It will
        be linked to this page, so the bookmark finds it next time.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or author"
          aria-label="Filter by title or author"
          className="field w-72 max-w-full"
        />
        {needing > 0 ? (
          <button type="button" onClick={() => setAll(!all)} className="text-ink-dim underline hover:text-ink">
            {all ? `Only books needing a cover (${needing})` : `All books (${candidates.length})`}
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-dim">
          Nothing matches{!all ? " among books needing a cover" : ""}.
          {!all ? (
            <>
              {" "}
              <button type="button" onClick={() => setAll(true)} className="underline hover:text-ink">
                Look through all books
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.slice(0, SHOWN).map((c) => (
            <li key={c.editionId} className="border-b border-line">
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(c.editionId)}
                className="flex w-full flex-wrap items-baseline gap-x-2 py-1.5 text-left hover:text-ink disabled:text-ink-dim"
              >
                <span className="text-ink">{c.title}</span>
                {c.authors.length ? <span className="text-ink-dim">{c.authors.slice(0, 3).join(", ")}</span> : null}
                <span className="text-ink-dim">
                  · {c.editionName}
                  {c.cover === "missing" ? " · no cover" : c.cover === "review" ? " · cover to review" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > SHOWN ? (
        <p className="text-ink-dim">
          {shown.length - SHOWN} more; type in the filter to narrow them down.
        </p>
      ) : null}
    </section>
  );
}
