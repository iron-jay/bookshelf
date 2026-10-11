"use client";

import { useEffect, useRef, useState } from "react";

import { bookmarkletHref } from "@/lib/goodreads-bookmarklet";

/**
 * The bookmarklet has to come back to the address this browser reaches
 * bookshelf at, which only the browser knows for sure: ORIGIN is often left
 * at the example's localhost, and a proxy or LAN address can differ from it.
 *
 * React refuses to render a `javascript:` href — rightly, for anything built
 * from user input. This one is built from the page's own origin, so it is set
 * on the element directly after render.
 *
 * A phone cannot drag a link to its bookmarks (2026-10-11), so the same code
 * can be copied and pasted into a bookmark instead. The clipboard needs https
 * or localhost; on a plain-http LAN address the code is shown, selected, to
 * copy by hand.
 */
export function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);
  const shown = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);

  useEffect(() => {
    if (copied === "manual") shown.current?.select();
  }, [copied]);

  async function copy() {
    const href = bookmarkletHref(window.location.origin);
    setCode(href);
    try {
      await navigator.clipboard.writeText(href);
      setCopied("yes");
    } catch {
      setCopied("manual");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <a
          ref={ref}
          onClick={(event) => event.preventDefault()}
          className="w-fit cursor-grab border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim"
          title="Drag me to your bookmarks bar"
        >
          bookshelf ← Goodreads
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
        >
          {copied === "yes" ? "Copied" : "Copy it, for a phone"}
        </button>
      </div>

      {copied === "manual" ? (
        <label className="flex flex-col gap-1.5 font-narrow">
          <span className="text-ink-dim">
            This browser would not copy it from a plain-http address. Select all of this and copy it:
          </span>
          <textarea
            ref={shown}
            readOnly
            value={code}
            rows={4}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full max-w-xl border border-line bg-ground px-3 py-2 font-mono text-xs text-ink"
          />
        </label>
      ) : null}

      <details className="max-w-2xl font-narrow text-ink-dim">
        <summary className="cursor-pointer hover:text-ink">On a phone</summary>
        <div className="mt-2 flex flex-col gap-3">
          <div>
            <p className="text-ink">iPhone or iPad, Safari</p>
            <ol className="list-decimal pl-5">
              <li>Copy it with the button above.</li>
              <li>Bookmark any page (share button → Add Bookmark), naming it “bookshelf ← Goodreads”.</li>
              <li>Open Bookmarks, Edit, tap the new bookmark, and replace its address with what you copied.</li>
              <li>On a book’s Goodreads page, open Bookmarks and tap it.</li>
            </ol>
          </div>
          <div>
            <p className="text-ink">Android, Chrome</p>
            <ol className="list-decimal pl-5">
              <li>Copy it with the button above.</li>
              <li>Bookmark any page (⋮ → ☆), then edit the bookmark: name it “bookshelf ← Goodreads” and replace its URL with what you copied.</li>
              <li>On a book’s Goodreads page, type “bookshelf” in the address bar and tap the bookmark in the suggestions. (Opening it from the bookmarks list does not run it.)</li>
            </ol>
          </div>
          <p>
            Firefox on Android does not run bookmarklets. If the phone blocks the new tab, the bookmark opens bookshelf
            in the same one instead; back returns to Goodreads.
          </p>
        </div>
      </details>
    </div>
  );
}
