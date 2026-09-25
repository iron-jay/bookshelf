/**
 * The shelf keeps its whole state in the URL, which is what makes a view
 * bookmarkable — and also what loses it, because the links back to the shelf go
 * to a bare "/". Look at one book, click back, and the grouping you set is gone.
 *
 * So the shelf records its own query string and those links restore it. Nothing
 * else reads it: "/" typed or bookmarked is still a clean shelf, and a view is
 * never restored behind your back.
 *
 * Read on click rather than on the server, because the header lives in a layout
 * and a layout is not re-rendered as you navigate within it — a value read there
 * would be however stale the last full page load left it.
 */
// Its own name: cookies are scoped by host, not port, and gameshelf's is
// "shelf-view" on the same box.
export const SHELF_VIEW_COOKIE = "bookshelf-view";
const A_YEAR = 60 * 60 * 24 * 365;

/**
 * The parts of a shelf view that are a preference rather than a question.
 *
 * How you like to sort, group and lay out the shelf is how you like to look at
 * it, and it should survive a bare "/" — a bookmark, a fresh tab, the landing
 * after adding a book. Which shelf you were filtering to is what you were
 * looking at a minute ago, and restoring that unasked would leave you staring
 * at a subset with no memory of why.
 */
const PREFERENCE_KEYS = ["sort", "groupBy", "view"] as const;

export type ShelfPreferences = Partial<Record<(typeof PREFERENCE_KEYS)[number], string>>;

/** Read on the server, from the same cookie the shelf writes on every render. */
export function preferencesFrom(raw: string | undefined): ShelfPreferences {
  if (!raw) return {};

  const stored = new URLSearchParams(raw);
  const preferences: ShelfPreferences = {};
  for (const key of PREFERENCE_KEYS) {
    const value = stored.get(key);
    if (value) preferences[key] = value;
  }

  return preferences;
}

/** Everything the shelf page reads out of the URL. */
const SHELF_PARAMS = ["status", "sort", "groupBy", "view"] as const;

/**
 * The value is stored raw: URLSearchParams percent-encodes everything outside
 * its own unreserved set, so a query string never contains a character a cookie
 * cannot hold.
 *
 * An empty query is stored rather than dropped — turning every filter off is a
 * view too, and it should be the one you come back to.
 */
export function rememberShelfView(query: string): void {
  document.cookie = `${SHELF_VIEW_COOKIE}=${query}; path=/; max-age=${A_YEAR}; samesite=lax`;
}

/** Where the shelf links should point, given what the shelf last recorded. */
export function shelfHref(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SHELF_VIEW_COOKIE}=([^;]*)`));
  if (!match) return "/";

  // A cookie deserves no more trust than a query string, so it gets the same
  // filtering the page itself applies — unknown keys never reach the href.
  const stored = new URLSearchParams(match[1]);
  const query = new URLSearchParams();
  for (const key of SHELF_PARAMS) {
    const value = stored.get(key);
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}
