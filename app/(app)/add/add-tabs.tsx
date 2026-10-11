import Link from "next/link";

/**
 * Door A's two kinds (2026-10-11): books are searched on Open Library and
 * Hardcover, comics and graphic novels on Comic Vine. Links, not state, so
 * each is its own page and the back button works.
 */
export function AddTabs({ current }: { current: "book" | "comic" }) {
  const tab = (kind: "book" | "comic", href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === kind ? "page" : undefined}
      className={current === kind ? "font-medium" : "text-ink-dim hover:text-ink"}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-6 flex gap-5 font-narrow">
      {tab("book", "/add", "Add book")}
      {tab("comic", "/add/comic", "Add comic or graphic novel")}
    </nav>
  );
}

/** Comic Vine asks for a link back wherever its data is shown (its API terms). */
export function ComicVineCredit() {
  return (
    <p className="mt-8 font-narrow text-ink-dim">
      Comic data from{" "}
      <a href="https://comicvine.gamespot.com/" rel="noreferrer" className="underline hover:text-ink">
        Comic Vine
      </a>
      .
    </p>
  );
}
