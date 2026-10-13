"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; current: (path: string, view: string | null) => boolean };

const ON_SHELF = (path: string) =>
  path === "/" || ["/edition", "/work", "/series", "/collection"].some((prefix) => path.startsWith(prefix));

/**
 * The shelves overview and the full wall are both "/", told apart by ?show=all
 * (page.tsx; `view` was already grid or list), so which one is current has to
 * read the query as well as the path.
 */
const DESKTOP: Item[] = [
  { href: "/", label: "Shelves", current: (path, view) => path === "/" && view !== "all" },
  { href: "/?show=all", label: "All books", current: (path, view) => path === "/" && view === "all" },
  { href: "/add", label: "Add", current: (path) => path.startsWith("/add") },
];

const TABS: Item[] = [
  { href: "/", label: "Shelves", current: ON_SHELF },
  { href: "/search", label: "Search", current: (path) => path.startsWith("/search") },
  { href: "/add", label: "Add", current: (path) => path.startsWith("/add") },
  { href: "/settings", label: "More", current: (path) => path.startsWith("/settings") || path.startsWith("/art") || path.startsWith("/goodreads-fill") },
];

function useCurrent() {
  const path = usePathname();
  const view = useSearchParams().get("show");
  return (item: Item) => item.current(path, view);
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
 * you go move to the bottom, where a thumb is. Words rather than icons: four
 * of them fit, and an icon set is a system to maintain for no gain.
 */
export function TabBar() {
  const isCurrent = useCurrent();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 bg-well pb-[env(safe-area-inset-bottom)] font-narrow sm:hidden">
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
