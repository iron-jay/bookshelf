// Written by `npm run extension:extract` from lib/goodreads-bookmarklet.ts.
// Edit it there, not here.
function extract(doc, path) {
  var m = /\/book\/show\/(\d+)/.exec(path);
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
}
