import Link from "next/link";

import { Cover } from "./cover";
import { ShelfLink } from "./shelf-link";
import { CoverEditor } from "./cover-editor";

/** Opened from /art, a cover page returns there; otherwise to the book. */
export function backFor(from: string | string[] | undefined, book: { href: string; label: string }) {
  return from === "art" ? { backHref: "/art", backLabel: "cover art to review" } : { backHref: book.href, backLabel: book.label };
}

/**
 * A cover's own page: the current cover large beside every way to change it.
 * Shared by /work/[slug]/cover and /edition/[id]/cover, which differ only in
 * whose cover it is.
 */
export function CoverPage({
  kind,
  id,
  title,
  author,
  coverUrl,
  hasOwnCover,
  needsReview,
  note,
  backHref,
  backLabel,
}: {
  kind: "work" | "edition";
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  hasOwnCover: boolean;
  needsReview: boolean;
  note: string | null;
  backHref: string;
  /** Where the page returns to, when that is not the book (/art). */
  backLabel: string;
}) {
  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-2 font-narrow">
        <Link href={backHref} className="text-ink-dim underline hover:text-ink">
          Back to {backLabel}
        </Link>
      </p>
      <h1 className="mb-6 font-display text-3xl">Cover for {title}</h1>
      <div className="flex flex-col gap-8 sm:flex-row">
        <div className="w-56 shrink-0">
          <Cover title={title} author={author} coverUrl={coverUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <CoverEditor
            kind={kind}
            id={id}
            hasOwnCover={hasOwnCover}
            needsReview={needsReview}
            note={note}
            seedTerm={[title, author?.split(", ")[0]].filter(Boolean).join(" ")}
            back={backHref}
          />
        </div>
      </div>
    </main>
  );
}

/**
 * A way off a book page to one of its own pages (cover, details), under the
 * cover: plainly a button, since as fold-outs they were hard to find.
 */
export function SideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="btn btn-sm">
      {children}
    </Link>
  );
}

export function ChangeCoverLink({ href, needsReview }: { href: string; needsReview: boolean }) {
  return <SideLink href={href}>{needsReview ? "Cover needs review" : "Change cover"}</SideLink>;
}

/** Top of a book's page: back to the shelf, at the place you left it. */
export function BackToShelf() {
  return (
    <p className="mb-3">
      <ShelfLink
        restoreScroll
        className="inline-flex min-h-11 items-center font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
      >
        Back to shelf
      </ShelfLink>
    </p>
  );
}
