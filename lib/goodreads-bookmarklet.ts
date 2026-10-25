/**
 * The Goodreads bookmarklet (brief §4b). It runs in the person's own browser,
 * on a Goodreads book page they are looking at, reads what that page already
 * shows, and hands it to a bookshelf page with postMessage. bookshelf's server
 * never fetches Goodreads: Goodreads has no public API, and automated fetching
 * is against its terms. This is the browser doing the copying a person would.
 *
 * `extract` is written as plain browser JavaScript and shipped as source text,
 * so the same function runs inside the bookmarklet and in the tests.
 */

export type GoodreadsPageData = {
  goodreadsId: number;
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  series: string | null;
  position: string | null;
  year: number | null;
  /**
   * Added 2026-10-25 for adding a book from its page (the Firefox extension).
   * A bookmarklet saved before then sends none of them, so all are optional.
   */
  authors?: string[];
  isbn?: string | null;
  format?: "book" | "audiobook" | null;
};

/**
 * Reads a Goodreads book page. Its data sits in the Next.js payload
 * (`__NEXT_DATA__` → apolloState: the Book keyed by legacyId, its first
 * bookSeries, its contributors credited as Author, the edition's ISBN and
 * format, the work's publicationTime), which is the whole book; the og:
 * meta tags are the fallback if that ever moves. Returns null off a book page.
 */
export const EXTRACT_SOURCE = `function extract(doc, path) {
  var m = /\\/book\\/show\\/(\\d+)/.exec(path);
  if (!m) return null;
  var id = m[1];
  var meta = function (p) { var el = doc.querySelector('meta[property="' + p + '"]'); return el ? el.getAttribute("content") : null; };
  var out = { goodreadsId: Number(id), title: meta("og:title"), description: meta("og:description"), coverUrl: meta("og:image"), series: null, position: null, year: null, authors: [], isbn: null, format: null };
  try {
    var st = JSON.parse(doc.getElementById("__NEXT_DATA__").textContent).props.pageProps.apolloState;
    var book = null;
    for (var k in st) { var v = st[k]; if (v && v.__typename === "Book" && String(v.legacyId) === id) { book = v; break; } }
    if (book) {
      out.title = book.title || out.title;
      out.description = book['description({"stripped":true})'] || book.description || out.description;
      out.coverUrl = book.imageUrl || out.coverUrl;
      var bs = (book.bookSeries || [])[0];
      if (bs) {
        out.position = bs.userPosition || null;
        var ref = bs.series && bs.series.__ref;
        out.series = ref && st[ref] ? st[ref].title || null : null;
      }
      var name = function (edge) { var c = edge && edge.node && st[edge.node.__ref]; return c && c.name ? c.name : null; };
      var edges = [book.primaryContributorEdge].concat(book.secondaryContributorEdges || []);
      for (var i = 0; i < edges.length; i++) {
        var who = edges[i] && (i === 0 || edges[i].role === "Author") ? name(edges[i]) : null;
        if (who && out.authors.indexOf(who) < 0) out.authors.push(who);
      }
      var det = book.details || {};
      out.isbn = det.isbn13 || det.isbn || null;
      if (det.format) out.format = /audio/i.test(det.format) ? "audiobook" : "book";
      var work = book.work && st[book.work.__ref];
      var t = (work && work.details && work.details.publicationTime) || (book.details && book.details.publicationTime);
      if (t) out.year = new Date(t).getUTCFullYear();
    }
  } catch (e) {}
  return out;
}`;

/** The same function, callable in Node for tests. */
export function extract(doc: unknown, path: string): GoodreadsPageData | null {
  return new Function(`${EXTRACT_SOURCE}; return extract;`)()(doc, path) as GoodreadsPageData | null;
}

/**
 * The `javascript:` link to drag to the bookmarks bar (or paste into a
 * bookmark, on a phone). `origin` is bookshelf's address as the browser
 * reaches it, which the opened page answers from; the data is posted only to
 * that origin, and only after that page says it is ready.
 *
 * Phones block new tabs more readily (2026-10-11). When the tab cannot open,
 * this one goes to bookshelf instead, the details in the address's fragment —
 * which browsers never send to a server — and back returns to Goodreads.
 */
export function bookmarkletHref(origin: string): string {
  const o = JSON.stringify(origin.replace(/\/+$/, ""));
  const body = `(function(){${EXTRACT_SOURCE}
var d = extract(document, location.pathname);
if (!d) { alert("Open a Goodreads book page first, then click this bookmark."); return; }
var B = ${o};
var w = window.open(B + "/goodreads-fill", "_blank");
if (!w) { location.href = B + "/goodreads-fill#book=" + encodeURIComponent(JSON.stringify(d)); return; }
window.addEventListener("message", function h(e) {
  if (e.origin !== B || e.data !== "bookshelf-ready") return;
  w.postMessage({ type: "bookshelf-goodreads", book: d }, B);
  window.removeEventListener("message", h);
});
})();`;
  return `javascript:${encodeURIComponent(body.replace(/\n\s*/g, " "))}`;
}
