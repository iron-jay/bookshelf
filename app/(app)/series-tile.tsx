import Link from "next/link";

import type { SeriesOnShelf } from "@/lib/books/series-shelf";

import { Cover } from "./cover";

/**
 * One series on the overview: its first book's cover with the edges of more
 * standing behind it (the stack a finished comic run gets), and its name
 * above. Above rather than on the cover, which carries nothing but the
 * rating sticker, or under it, where the plank has to be. gameshelf draws its
 * series the same way.
 */
export function SeriesTile({ series, index }: { series: SeriesOnShelf; index: number }) {
  return (
    <li
      className="shelf-tile group relative w-[28vw] max-w-32 sm:w-32"
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <Link href={`/series/${series.slug}`} className="block">
        <p className="line-clamp-2 font-display text-[15px] leading-tight break-words group-hover:underline">
          {series.name}
        </p>
        <p className="mb-2 font-narrow text-sm text-ink-dim">
          {series.finished > 0
            ? `${series.finished} of ${series.books} finished`
            : `${series.books} ${series.books === 1 ? "book" : "books"}`}
        </p>
        <div className={series.books > 1 ? "run-stack" : undefined}>
          <Cover title={series.title} author={series.authors.join(", ") || null} coverUrl={series.coverUrl} />
        </div>
      </Link>
    </li>
  );
}
