# Ideas — not in v1

Things deliberately left out of scope. Noted so they are not lost, and so they
are not quietly built.

- **Authors table and author pages.** Authors are `text[]` + `author_sort` on
  the work until author pages are a real want (brief §2).
- Social features, reading challenges, page-by-page progress, quotes and
  highlights, recommendations, stats dashboards, a mobile app (brief §5).

## Left over from v1 scope (not ideas — owed)

- Cover upload and paste-a-URL (§4a #3), and the `/art` page for covers flagged
  `cover_needs_review` (§4a), linked from Settings. Nothing but the Google
  title fallback sets that flag yet, and it needs `GOOGLE_BOOKS_API_KEY`.
- Editing a work or edition after adding it (title, author sort, kind, base
  edition). Only format, series, shelf, rating, review, reads and tags are
  editable.
- README with the deploy steps; the GHCR workflow has never run.
