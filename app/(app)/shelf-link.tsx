"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { shelfHref } from "./shelf-view";

/**
 * A link back to the shelf as you left it. The destination is read at click
 * time, so it is never the stale one a layout rendered hours ago.
 *
 * The href stays "/" so the markup is the same on both sides of hydration and
 * the link still works with scripting off — it just lands on a clean shelf.
 * Modified clicks are left alone for the same reason: a new tab should be the
 * plain shelf, not a copy of this one's filters.
 */
export function ShelfLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href="/"
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Link leaves a click alone once it has been defaulted-prevented, so
        // this replaces its navigation rather than racing it.
        event.preventDefault();
        router.push(shelfHref());
      }}
    >
      {children}
    </Link>
  );
}
