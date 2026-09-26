"use client";

import { useEffect, useRef } from "react";

/**
 * React refuses to render a `javascript:` href — rightly, for anything built
 * from user input. This one is built by the server from bookshelf's own
 * ORIGIN, so it is set on the element directly after render.
 */
export function BookmarkletLink({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);
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
