import Image from "next/image";

/**
 * A book's cover in a fixed 2:3 cell — the art when there is some, otherwise
 * the typeset placeholder — and the label band for community editions.
 *
 * Covers are cropped into the cell rather than letterboxed (§5b): book art is
 * roughly 2:3 but rarely exactly, and bars on every other tile would read as
 * a broken grid.
 *
 * Sized entirely by its container, so the same component is a shelf tile and a
 * list-row thumbnail. The placeholder's type is set in container units for the
 * same reason: a title set for a 160px tile would overflow a 48px one.
 */
export function Cover({
  title,
  author,
  coverUrl,
  band,
}: {
  title: string;
  author: string | null;
  coverUrl: string | null;
  /** Community editions only: the edition's own name, and its credit. */
  band: { name: string; credit: string | null } | null;
}) {
  return (
    <div className="@container relative aspect-[2/3] w-full overflow-hidden bg-panel">
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt=""
          fill
          sizes="160px"
          className="object-cover"
          // Served by the session-checked /covers route, which the image
          // optimiser cannot fetch: it carries no cookie.
          unoptimized
        />
      ) : (
        <Placeholder title={title} author={author} />
      )}

      {/* The one bold element in the app: a solid band across the lower part of
          the cover. Official editions get nothing — the absence is the signal.
          Never extended to audiobooks or formats (§5b). */}
      {band ? (
        <div className="absolute inset-x-0 bottom-0 bg-label px-[6cqw] py-[4cqw]">
          <p className="truncate font-narrow text-[max(9px,9cqw)] leading-tight font-medium text-ground">
            {band.name}
          </p>
          {band.credit ? (
            <p className="truncate font-narrow text-[max(9px,8cqw)] leading-tight text-ground">
              {band.credit}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Not an error state. Plenty of books, and nearly every fic, will live here
 * permanently, so it is set like a plain cover: title large in Newsreader,
 * a single rule, the author small beneath. HTML rather than a stored image, so
 * it follows title edits.
 */
function Placeholder({ title, author }: { title: string; author: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-col p-[9cqw]">
      <p className="line-clamp-6 font-serif text-[12cqw] leading-[1.1] font-medium break-words text-ink">
        {title}
      </p>
      {author ? (
        <>
          <hr className="my-[7cqw] w-[30cqw] border-line" />
          <p className="line-clamp-2 font-narrow text-[8cqw] leading-snug text-ink-dim">{author}</p>
        </>
      ) : null}
    </div>
  );
}
