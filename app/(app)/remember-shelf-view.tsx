"use client";

import { useEffect } from "react";

import { rememberShelfView } from "./shelf-view";

/**
 * Records the shelf's current query string so the links back to it have
 * somewhere to go. The query arrives as a prop rather than from
 * useSearchParams so it changes on every navigation the page renders for,
 * including the ones that only alter the query.
 */
export function RememberShelfView({ query }: { query: string }) {
  useEffect(() => {
    rememberShelfView(query);
  }, [query]);

  return null;
}
