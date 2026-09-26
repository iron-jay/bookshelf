"use client";

import { useEffect } from "react";

import { rememberShelfScroll, rememberShelfView, takeShelfScroll } from "./shelf-view";

/**
 * Records the shelf's current query string so the links back to it have
 * somewhere to go, and how far down it you are so "Back to shelf" can return
 * you there. The query arrives as a prop rather than from useSearchParams so
 * it changes on every navigation the page renders for, including the ones
 * that only alter the query.
 */
export function RememberShelfView({ query }: { query: string }) {
  useEffect(() => {
    rememberShelfView(query);

    const y = takeShelfScroll(query);
    // The shelf is server-rendered and its cells have a fixed ratio, so the
    // page is its full height by now; the frame lets layout settle first.
    if (y !== null) requestAnimationFrame(() => window.scrollTo(0, y));

    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        // Opening a book scrolls the new page to the top before this listener
        // is gone; by then the address is the book's, so that scroll is not
        // the shelf's and must not overwrite where you were.
        if (window.location.pathname === "/") rememberShelfScroll(query, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [query]);

  return null;
}
