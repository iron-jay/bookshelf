"use client";

import { useEffect, useState } from "react";

/**
 * The shelves overview's share of the one orchestrated moment (§5b): the
 * covers resolve on arrival, not on every return from a book, for the same
 * reason the wall's grid does (shelf-grid.tsx).
 */
let resolvedOnce = false;

export function ResolveOnce({ children }: { children: React.ReactNode }) {
  const [resolving] = useState(() => !resolvedOnce);
  useEffect(() => {
    resolvedOnce = true;
  }, []);

  return <div className={resolving ? "shelf-resolving" : undefined}>{children}</div>;
}
