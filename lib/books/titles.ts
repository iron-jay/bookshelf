/**
 * Deciding whether a catalogue's title names the same book as a Goodreads
 * title. Shared by the Goodreads import (Open Library) and the Hardcover
 * source, so both hold books to the same standard. The rules were tuned
 * against Jay's real 410-book export: see PROGRESS.md, 2026-09-25.
 */

export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const words = (text: string) => (text ? text.split(" ").length : 0);

/**
 * Whether a candidate's title — Open Library's title, alone or with its
 * subtitle — names the same book as a Goodreads title. What decides it is
 * which side is longer and where the shorter one ends:
 *
 * - Equal: yes.
 * - Open Library's is longer — it adds a subtitle ("Guards! Guards!: A
 *   Discworld Novel") or a franchise prefix ("Star Wars: Trials of the Jedi
 *   (High Republic)"): yes, if the Goodreads title is there as a whole phrase
 *   of two words or more (three when it is not at the start).
 * - Open Library's is shorter: only if it stops at one of the Goodreads
 *   title's colons and what is left is a tagline — "A Master Chief Story",
 *   "A Novel": a part starting "A" or "An" that describes the book rather than
 *   naming it. "Halo: Edge of Dawn" for "Halo: Edge of Dawn: A Master Chief
 *   Story" passes. "Star Wars : the High Republic" for "Star Wars: The High
 *   Republic: Edge of Balance, Vol. 4" does not — a franchise can run to two
 *   parts, and Open Library filed Vol. 3 and Vol. 4 under that one work in the
 *   trial run. Nor does "Halo", "The Sandman" or anything stopping mid-part.
 */
export function sameTitle(candidate: string, subtitle: string | null, goodreadsTitle: string): boolean {
  const r = fold(goodreadsTitle);
  const parts = goodreadsTitle.split(":");
  // Each way of cutting the title at a colon where the rest is a tagline.
  const taglineCuts = parts
    .map((_, i) => i)
    .filter((i) => i < parts.length - 1 && /^(a|an) /.test(fold(parts.slice(i + 1).join(" "))))
    .map((i) => fold(parts.slice(0, i + 1).join(" ")));

  return [fold(candidate), fold(`${candidate} ${subtitle ?? ""}`)].some((c) => {
    if (!c || !r) return false;
    if (c === r) return true;
    if (c.length > r.length) {
      if (words(r) >= 2 && c.startsWith(`${r} `)) return true;
      return words(r) >= 3 && ` ${c} `.includes(` ${r} `);
    }
    return taglineCuts.includes(c);
  });
}

/**
 * What to search Open Library for, best first. Goodreads titles carry things
 * Open Library's do not: a trailing bracket ("(Star Wars: The High Republic)",
 * "(Unabridged)"), an English title in square brackets after a Japanese one
 * ("ドラゴンボール超 24 [Dragon Ball Super 24]"), and long subtitles. Each is
 * tried only if the one before found nothing, so a book that matches first
 * time costs one request.
 *
 * `match` is what a result is compared against: only faithful forms of the
 * title. The part before the last colon is a search term, never a match
 * target — "Star Wars" would otherwise match any Star Wars book by the author.
 */
export function titleQueries(title: string): { search: string[]; match: string[] } {
  const bare = title.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
  const bracketed = title.match(/\[([^\]]+)\]/)?.[1]?.trim();
  const beforeColon = bare.includes(":") ? bare.slice(0, bare.lastIndexOf(":")).trim() : "";
  const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const match = unique([bare || title, bracketed]);
  return { search: unique([...match, words(fold(beforeColon)) >= 2 ? beforeColon : ""]), match };
}

/**
 * Whether two author lists share a surname — the second half of every title
 * match. An empty list on our side matches anything: a title-only book is
 * still worth a strict title check.
 */
export function shareAnAuthor(theirs: string[], ours: string[]): boolean {
  if (ours.length === 0) return true;
  const folded = fold(theirs.join(" ")).split(" ");
  return ours.some((name) => {
    const surname = fold(name).split(" ").pop();
    return surname ? folded.includes(surname) : false;
  });
}
