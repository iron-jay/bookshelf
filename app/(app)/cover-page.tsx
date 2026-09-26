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
  heading,
  author,
  coverUrl,
  band,
  hasOwnCover,
  needsReview,
  canLookUp,
  note,
  backHref,
  backLabel,
}: {
  kind: "work" | "edition";
  id: string;
  title: string;
  /** What the page is called: the work's title, or the edition's name for a fan translation. */
  heading: string;
  author: string | null;
  coverUrl: string | null;
  band: { name: string; credit: string | null } | null;
  hasOwnCover: boolean;
  needsReview: boolean;
  canLookUp: boolean;
  note: string | null;
  backHref: string;
  /** Where the page returns to, when that is not the book (/art). */
  backLabel: string;
}) {
  return (
    <main className="flex-1 p-6">
      <p className="mb-2 font-narrow">
        <Link href={backHref} className="text-ink-dim underline hover:text-ink">
          Back to {backLabel}
        </Link>
      </p>
      <h1 className="mb-6 text-xl font-medium">Cover for {heading}</h1>
      <div className="flex flex-col gap-8 sm:flex-row">
        <div className="w-56 shrink-0">
          <Cover title={title} author={author} coverUrl={coverUrl} band={band} />
        </div>
        <div className="min-w-0 flex-1">
          <CoverEditor
            kind={kind}
            id={id}
            hasOwnCover={hasOwnCover}
            needsReview={needsReview}
            canLookUp={canLookUp}
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
    <Link href={href} className="border border-line bg-panel px-3 py-1.5 text-center font-narrow hover:border-ink-dim">
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
    <p className="mb-4">
      <ShelfLink
        restoreScroll
        className="inline-block border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim"
      >
        Back to shelf
      </ShelfLink>
    </p>
  );
}
