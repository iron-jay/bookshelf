"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; current: (path: string, wall: boolean) => boolean };

/**
 * The shelves overview and the full wall are both "/", told apart by the query
 * (page.tsx; `view` was already grid or list), so which one is current has to
 * read the query as well as the path. The overview is ten to a shelf; "All
 * shelves" is every shelf in full, the wall grouped by shelf (Jay, 2026-10-20).
 */
const OVERVIEW = (path: string, wall: boolean) => path === "/" && !wall;
const WALL = (path: string, wall: boolean) => path === "/" && wall;
const ALL_SHELVES = "/?show=all&groupBy=shelf";

const DESKTOP: Item[] = [
  { href: "/", label: "Shelves", current: OVERVIEW },
  { href: ALL_SHELVES, label: "All shelves", current: WALL },
  { href: "/add", label: "Add", current: (path) => path.startsWith("/add") },
];

const TABS: Item[] = [
  {
    href: "/",
    label: "Shelves",
    current: (path, wall) =>
      OVERVIEW(path, wall) || ["/edition", "/work", "/series", "/collection"].some((prefix) => path.startsWith(prefix)),
  },
  { href: ALL_SHELVES, label: "All", current: WALL },
  { href: "/search", label: "Search", current: (path) => path.startsWith("/search") },
  { href: "/add", label: "Add", current: (path) => path.startsWith("/add") },
  { href: "/settings", label: "More", current: (path) => path.startsWith("/settings") || path.startsWith("/art") || path.startsWith("/goodreads-fill") },
];

function useCurrent() {
  const path = usePathname();
  const query = useSearchParams();
  // Mirrors page.tsx: any of these asks for the wall rather than the overview.
  const wall = query.get("show") === "all" || ["status", "tag"].some((key) => query.get(key));
  return (item: Item) => item.current(path, wall);
}

/** The header's own nav, for anything wider than a phone. */
export function MainNav() {
  const isCurrent = useCurrent();

  return (
    <nav className="hidden items-center gap-6 font-narrow sm:flex">
      {DESKTOP.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(item) ? "page" : undefined}
          className="border-b-2 border-transparent pb-0.5 text-ink-dim hover:text-ink aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * On a phone the header has room for the name and nothing else, so the places
 * you go move to the bottom, where a thumb is. Words rather than icons: five
 * of them fit, and an icon set is a system to maintain for no gain.
 */
export function TabBar() {
  const isCurrent = useCurrent();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 bg-well pb-[env(safe-area-inset-bottom)] font-narrow sm:hidden">
      {TABS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(item) ? "page" : undefined}
          className="flex items-center justify-center text-ink-dim aria-[current=page]:font-bold aria-[current=page]:text-accent"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
