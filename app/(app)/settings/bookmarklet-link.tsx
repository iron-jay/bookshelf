"use client";

import { useEffect, useRef } from "react";

import { bookmarkletHref } from "@/lib/goodreads-bookmarklet";

/**
 * The bookmarklet has to come back to the address this browser reaches
 * bookshelf at, which only the browser knows for sure: ORIGIN is often left
 * at the example's localhost, and a proxy or LAN address can differ from it.
 *
 * React refuses to render a `javascript:` href — rightly, for anything built
 * from user input. This one is built from the page's own origin, so it is set
 * on the element directly after render.
 */
export function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);
  return (
    <a
      ref={ref}
      onClick={(event) => event.preventDefault()}
      className="w-fit cursor-grab border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim"
      title="Drag me to your bookmarks bar"
    >
      bookshelf ← Goodreads
    </a>
  );
}
