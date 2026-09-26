import Link from "next/link";

import { Cover } from "./cover";
import { CoverEditor } from "./cover-editor";

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
}) {
  return (
    <main className="flex-1 p-6">
      <p className="mb-2 font-narrow">
        <Link href={backHref} className="text-ink-dim underline hover:text-ink">
          Back to {heading}
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
          />
        </div>
      </div>
    </main>
  );
}

/** The way onto a cover page from under a book's cover: plainly a button. */
export function ChangeCoverLink({ href, needsReview }: { href: string; needsReview: boolean }) {
  return (
    <Link
      href={href}
      className="border border-line bg-panel px-3 py-1.5 text-center font-narrow hover:border-ink-dim"
    >
      {needsReview ? "Cover needs review" : "Change cover"}
    </Link>
  );
}
