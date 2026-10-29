# bookshelf — Project Brief

Self-hosted book tracker. Goodreads' interaction model and Open Library's
catalogue.

Sibling of **gameshelf** (`github.com/iron-jay/gameshelf`). Same stack, same
deployment shape, same design language. Where this brief is silent, do what
gameshelf does. Where the two disagree, this brief wins for this repo.

Single-user by default, multi-user capable. Runs as two containers on a home
server. No SaaS dependencies, and no API keys required to run.

---

## 1. Non-negotiables

These shape every other decision. Do not quietly relax them.

1. **A book no catalogue has is still a book.** One created by hand must be as
   easy to shelve, rate and review as a Penguin paperback. No second-class
   "custom book" flow bolted on the side.
   - Fan translations were the original reason for this rule, and the brief
     was built around them. Jay dropped them on 2026-10-11: not wanted.
     Migration `0004` **deleted** the existing ones (their entries, reads and
     tags with them, and works left with no edition), removed the
     `fan_translation` kind, and took the community rules out of
     `entry_cards`. Fanfic, podfic and fan edits went the same way on
     2026-09-25 (`0001`). Do not reintroduce any of them, nor the label band
     and colour that marked them.
2. **Open Library data is cached, never mirrored wholesale.** We fetch on demand
   and store what we fetched. We never run a bulk import of their dumps, and the
   app must work fully offline once a work is cached.
3. **Simple beats complete.** Goodreads-simple. If a feature needs a settings
   page to explain it, it is out of scope for v1.
4. **The data model is the product.** Get works/editions/entries/reads right;
   everything else is CRUD over it.

---

## 2. Data model

Full DDL in `schema.sql`. Read it before touching anything database-shaped.

The core split, in plain terms:

```
series      Discworld
 └ work       Guards! Guards!          #8         (usually an Open Library row)
    └ edition   Paperback, Corgi 1990  original   (openlibrary)
    └ edition   Audiobook, 2022        original   read by Peter Serafinowicz
    └ edition   Wachen! Wachen!        translation
        └ entry   Jay's shelf row: shelf, rating, review
            └ read   Mar 2026, finished
            └ read   Aug 2026, finished
```

This is Open Library's own model — works and editions — so the mapping from
their API is mechanical. That is deliberate; do not invent a third level.

### Two relations, and they are not the same thing

Each link means something different:

- `works.series_id` + `series_position` — **reading order**. Discworld #8.
  Positions are `numeric` because novellas are 2.5.
- `series.collection_id`, or `works.collection_id` for a book with no
  series — **what it belongs to**, above series (2026-10-11). Halo is a
  collection; the Forerunner trilogy is a series in it; a standalone Halo
  novel is in it directly. One collection per book: its series', else its
  own. Collections, like series, are matched by name without regard to case,
  created on first use and deleted once empty.
- `editions.base_edition_id` — **the same text, differently**. Translations,
  audiobooks of a specific text.

An edition never changes the story. A different story is a different work. If a
proposed feature blurs these, the feature is wrong, not the model.

Consequences to honour in the UI:

- A series page is an ordered list of works with your shelf state beside each,
  plus one button for having read the whole run (below, "Reads"), and the
  series' own name to rename or remove. That is the whole feature.
- Shelf grouping includes **collection** (series by series, each in order),
  **series** (in order) and **author**.
- Series are set on the book page **and on each edition's page** (the page a
  cover opens), and the wall's select mode puts many books in one at once
  (keeping a number a book already has there). The series and collection
  boxes drop down the names already here as you type and say when a typed
  name is new; the example cycles through them; Save says "Saved" until the
  box changes (Jay, 2026-10-20, as gameshelf).
- A number another book in the series already has is asked about, not
  saved: "Mort is already #4 in Discworld", then "Move it and the rest up
  one" (every other book at that number or later goes up by one) or "Keep
  both at #4" (Jay, 2026-10-21). Comic Vine runs are never asked: their
  numbers are the issues' own. Bulk "Put in series" sets no numbers, so it
  never asks; gameshelf has no numbers at all.
- The series page also renames a series (to a name already here, the two
  join and keep their numbers; two Comic Vine runs never join), removes it
  (its own confirm page, `/series/{slug}/remove`), and takes a book out of
  it. Removing only unlinks: books, entries and reads stay, and a book keeps
  the series' collection (Jay, 2026-10-20, as gameshelf).
- A collection page lists its series, each in order, then its books with no
  series; series in the order they began (earliest book's year).

Rules:

- A **work** is the abstract book. `ol_work_key` (`OL45804W`) is unique and
  nullable. `source = 'local'` works exist for things Open Library has never
  heard of — web serials, zines, out-of-print things.
- An **edition** is what you actually read or listened to. Every work has at
  least one. Derived editions set `base_edition_id` to the text they translate
  or narrate.
- An **entry** is unique per `(user_id, edition_id)`. Rating and review live
  here, so you can rate the translation differently from the original.
- A **read** is one pass through. Rereads are new reads, not edits.
- **Shelf** (the `status` column) is a state machine: `tbr`, `reading`,
  `finished`, `dnf`. Free-form buckets are **tags**. gameshelf arrived at this naming
  after launch; here it is the naming from day one, in the schema as well as the
  UI.
  - There is no wishlist. `tbr` means "want to read", whether or not you own it
    or it is out yet — Goodreads' own model. Removed 2026-09-25, before any
    code; do not reintroduce it as a shelf. If owning vs wanting ever matters,
    that is a tag.

When adding a feature, ask which of these tables it belongs to. If the answer is
"a new table", push back on the feature first. `series` and `collections` are
the two tables added over gameshelf's shape, and they earn it: series order
is how people read, and a franchise (Halo, Star Wars) is how they shelve.
Collections were Jay's ask on 2026-10-11; tags were the alternative offered
and turned down because they cannot group a shelf or order series within.

Authors are a `text[]` on the work plus an `author_sort` string, not a table.
Grouping by author works off `author_sort`. An authors table can come later if
author pages become a real want; note it in `IDEAS.md` until then.

---

## 3. Stack

Identical to gameshelf. Copy its setup rather than re-deriving it.

| Layer      | Choice                                        |
|------------|-----------------------------------------------|
| Framework  | Next.js (App Router), TypeScript strict       |
| DB         | PostgreSQL 16                                 |
| ORM        | Drizzle (schema mirrors `schema.sql`)         |
| Styling    | Tailwind                                      |
| Auth       | Argon2id password + DB session cookie         |
| Images     | Covers downloaded once and served locally     |
| Deploy     | Docker Compose, image built on GHCR           |

No Prisma, no NextAuth, no component library. Server Components and server
actions for everything; client components only where interaction demands it.

---

## 4. Open Library integration

- No key. Every request sends an identifying `User-Agent`:
  `bookshelf/<version> (<OPENLIBRARY_CONTACT>)`. Open Library asks for this and
  gives identified clients more headroom. With `OPENLIBRARY_CONTACT` unset the
  repository URL stands in, so requests are never anonymous.
- Serialise requests and stay around 1/second. One user will never hit a limit
  doing normal things, but an import of 800 Goodreads rows will — the importer
  must queue, not fan out.
- All Open Library access goes through `lib/openlibrary/`. No `fetch` to
  openlibrary.org anywhere else.
- Endpoints: `search.json` for search, `/works/{key}.json` and
  `/works/{key}/editions.json` on add, `/isbn/{isbn}.json` for ISBN lookup and
  import, `/authors/{key}.json` only to resolve names.
  - After `/isbn/`, the work comes from `search.json?q=key:/works/{key}`, not
    `/works/{key}.json`: search carries author *names*, the works endpoint only
    author keys, so it is one queued request instead of two or more.
  - `/isbn/` redirects to `/books/{key}.json`. An unknown ISBN is a 404 with an
    HTML body. Placeholder ISBNs (`9780000000002`) resolve to junk records —
    that is the data, not a bug to filter.
- On search: show results, write nothing. A `works` row appears only when the
  user adds something. Do not cache misses.
- Store the raw response in `works.ol_payload` so fields can be re-derived later
  without a refetch.
- Open Library's data is community-edited and uneven: missing covers, editions
  with no format, descriptions as either a string or `{type, value}`. Normalise
  in `lib/openlibrary/`, and when a field is missing, leave it empty rather than
  guessing.

## 4a. Covers

Books have no SteamGridDB. Art comes from, in order:

1. **Open Library covers** — `covers.openlibrary.org/b/id/{cover_id}-L.jpg`.
   Prefer the edition's cover, then the work's. Use cover ids, not ISBN URLs;
   ISBN cover lookups are rate-limited by IP and 404 as a 1×1 gif unless
   `?default=false` is passed.
2. **Google Books** — fallback when Open Library has nothing, looked up by ISBN.
   `GOOGLE_BOOKS_API_KEY` is optional in that nothing breaks without it, but
   unauthenticated requests share one quota with every anonymous caller, and on
   2026-09-25 it was already spent for the day (429). Without a key, expect
   this step to find nothing; with one, it works. All access through
   `lib/googlebooks/`. Confidence: ISBN match is exact, so apply
   with `cover_needs_review = false`. Title search is fuzzy — apply with
   `cover_needs_review = true`.
3. **Upload, or paste an image URL.** Always available. `cover_source = 'upload'`
   or `'url'`. The pasted URL is downloaded once, never hot-linked.
   - Or **choose from covers found** (as gameshelf's art picker): the edition's
     own, the work's, other editions' (capped), Google by ISBN and by title,
     plus a free-text search, Google first. The page sends back a source and an
     id — never an address — and the server builds the URL.
   - All of these live on a cover's own page — `/edition/{id}/cover`,
     `/work/{slug}/cover` — reached by a "Change cover" button under the
     cover (2026-09-26: folded away under the cover, they were hard to find
     and too cramped to compare covers). The candidates load as it opens.
     A successful change returns to where the page was opened from — the
     book, or `/art` (`?from=art`).
   - **Find missing covers** in Settings runs the auto-lookup order for every
     placeholder on the shelf, on demand — the manual refresh in bulk.
4. **Typeset placeholder** — see §5b. Not an error state: a lot of books
   will live here permanently and should look deliberate.

Rules carried over from gameshelf, because they were learned the hard way:

- An edition with no cover of its own shows the work's (`entry_cards`).
- Auto-lookup runs once on add and never re-runs on its own. Refresh is a manual
  action, so art you approved is never silently replaced.
- Covers needing review get their own page at `/art`, linked from Settings. Not a
  filter on the shelf.
- Download on add, store under `COVERS_DIR`, serve locally.

## 4b. Hardcover (optional)

Added 2026-09-26 after Jay's real import: Open Library lacked 100 of 410
books (self-published Kindle series, tie-in novels, manga), and Hardcover had
84 of them. With `HARDCOVER_API_TOKEN` set (a personal access token; its API is
GraphQL, beta, free plan 60/minute and 5,000/day):

- **Import**: a book that would become a local work is looked up on Hardcover
  first; a match fills its description, year, series (if Goodreads' title gave
  none) and cover, and records `works.hardcover_id`. It is still a local work —
  Hardcover is a source of details, not the catalogue.
- **Settings → Fill in from Hardcover**: the same for local works already
  here. Fills only empty fields; never overwrites.
- **Search** (2026-10-11): book search shows Hardcover's results beside Open
  Library's, minus any Open Library already has (same strict rule) or that is
  here already (`hardcover_id`). Adding one (`/add/hardcover/{id}`) makes a
  local work from Hardcover's answer, fetched by id on the server
  (`books_by_pk`), with a plain Book or Audiobook edition.
- **Covers**: after Google-by-ISBN and before Google-by-title in the lookup
  order, and a candidate source in the picker (`cover_source = 'hardcover'`).
- Matching is the importer's strict rule (`lib/books/titles.ts`: `sameTitle`
  plus a shared author surname), with Hardcover's alternative titles counted —
  how Japanese manga titles find their English entries. Hence no review flag.
- All access through `lib/hardcover/`. No token: nothing is requested. Every
  failure is "nothing found". Terms: personal use; no training AI models on the
  data.
- **Goodreads itself is not a server-side source.** It has had no public API
  since 2020; the private one some apps use (Grimmory) breaks its terms, and
  server fetching of its pages is the "robots / data extraction" its terms
  prohibit. Instead, one book at a time, in the person's own browser:
  - An imported edition links to its Goodreads page ("View on Goodreads").
  - The **bookmarklet** (Settings → One book at a time; `lib/goodreads-
    bookmarklet.ts`), built in the browser from the page's own origin — not
    `ORIGIN`, which is often left at localhost — reads the Goodreads page being viewed — the
    `__NEXT_DATA__` Book, `og:` tags as fallback — and posts it to
    `/goodreads-fill`, which accepts messages only from www.goodreads.com,
    finds the edition by `goodreads_book_id` — or, when none has it, lists
    your books to pick from (no cover or cover to review first, "all books"
    on request) and links the pick to that id —
    previews, and on Apply fills
    empty fields: description, year, series on the work; cover on the edition
    (a Goodreads id names an edition), optionally replacing one. Cover
    addresses are accepted only on Goodreads' image hosts (Amazon's).
  - **On a phone** (2026-10-11): a link cannot be dragged there, so Settings
    has "Copy it, for a phone" (the code shown to select by hand where the
    clipboard needs https) and steps for Safari and Chrome. Where the new tab
    is blocked, the bookmarklet opens `/goodreads-fill#book=…` in the same
    tab instead — the fragment never reaches a server — and the page reads
    it, unproven as to origin but checked and only shown until Apply. An
    iframe was asked for and is impossible: Goodreads sends
    `X-Frame-Options: SAMEORIGIN`, and a frame's page could not be read
    across origins anyway.
  - **The Firefox extension** (`extension/`, 2026-10-25, Jay: easier on a
    phone than the bookmarklet), for desktop and Android: an "Add to
    bookshelf" button on Goodreads book pages (and the toolbar or menu
    action) that runs the bookmarklet's own `extract` — `extension/extract.js`
    is written from `lib/goodreads-bookmarklet.ts` by `npm run
    extension:extract` and checked in the image build — and opens
    `/goodreads-fill#book=…` at the address set in its options. Manifest v2,
    one permission (storage). Signed unlisted on AMO by Jay; steps in its
    README. No AMO listing, no auto-update.
  - **The phone app** (2026-10-29, Jay: "a way for the app to get something
    from Goodreads"): Search → Browse Goodreads, a pasted Goodreads link, or
    "Search Goodreads" under the results opens Goodreads in the app's own web
    view, and "Add to bookshelf" on a book's page runs this same `extract`
    there (served by `GET /api/v1/goodreads`, so it is never copied) and
    opens the add sheet. `POST /goodreads/preview` decides as
    `/goodreads-fill` does (`linked`, `shelved` or `add` with `details`),
    `POST /entries { goodreads }` adds through `addGoodreadsBook`, and
    `POST /goodreads/fill` is Apply. The phone reads the page; the server
    still never fetches Goodreads.
  - **A page no book is linked to is offered to add** (2026-10-25), before
    the picker: found as the import finds a row (`planBook`), details from
    the page to look over (`BookDraft`, §5 Add flow), the page's cover on the
    new edition, linked by `goodreads_book_id`
    (`lib/books/add-from-goodreads.ts`). A book of yours with the page's ISBN
    is offered to fill in instead. The page now also sends authors, ISBN and
    Book or Audiobook (Goodreads' format containing "audio").

## 4c. Comic Vine (optional) — comics and graphic novels

Added 2026-10-11. With `COMICVINE_API_KEY` set (free with a Comic Vine
account), Door A's "Add comic or graphic novel" searches Comic Vine. Without
it that tab says how to get one and offers "create it by hand".

- Comic Vine's volume is a run (Saga, Image, 2012) or a collected edition;
  its issues are what you shelve — a single issue, a trade paperback, a
  graphic novel. **One issue is one work**, found again by
  `works.comicvine_issue_id`, `source = 'comicvine'`. A volume of more than
  one issue is the work's series, numbered by the issue; a volume of one is a
  graphic novel, titled by the volume alone. Writers are the authors (artists
  when no writer is; never the "other" staff credits). One plain "Book" edition; covers are
  `cover_source = 'comicvine'`.
- Search `/add/comic?q=` lists volumes; `/add/comic/{volumeId}` its issues
  (the first hundred) to pick from — one, several, or "Choose all"
  (2026-10-17: a run read in one go). Each issue is fetched again by id on
  add; the page sends them five at a time, as the import batches, and on
  Finished asks once for the day, starting at today. Issues already on the
  shelf are left as they are, as any add leaves them. Several land on the
  series page.
- **A run read to the end is one tile** (Jay, 2026-10-19). Each volume gets
  its own series, carrying `comicvine_volume_id` and Comic Vine's
  `issue_count` (refreshed when an issue is added again; for a series from
  before, looked up once when its page opens). Same-named volumes — Saga's
  issues and its trade paperbacks — are told apart as "Saga (2012)", else
  "Saga (Comic Vine 46568)". When you have finished at least that many of the
  series' works, the shelf (strips and wall, not under a tag filter) stacks
  their Finished entries into one tile: the series' name, the lowest issue's
  cover, the latest finish, no rating, opening the series page, where each
  issue is itself. A run only partly added or partly read never folds.
  `lib/books/runs.ts`; the API does the same with `GET /shelf?runs=fold`.
- All access through `lib/comicvine/`, serialised a second apart: its terms
  allow 200 requests per resource an hour and block bursts. Non-commercial use
  only, and **a link back wherever its data is shown**: the add pages credit
  it, and a comic's work page links to its Comic Vine page.

### Adding an edition or a book by hand

From any work page: **Add edition** → kind, name, base edition, credit, URL,
language, notes. That is it. No approval, no moderation. It is your server.

From search: if nothing matches, **Create work manually** with the same minimal
form. Used for web serials, zines, ARCs, out-of-print things.

---

## 5. Screens (v1 scope)

1. **Shelf** — the home page: the shelves overview (§5b), and the full wall at
   `/?show=all`. Grid or list, filter by shelf and tag, group by
   shelf / collection / series / author / year finished / year added / year published /
   book-or-audiobook. Year added is the entry's date (Goodreads' Date Added
   for an import).
   Year finished uses each book's latest finish (a reread moves it), with
   "Not finished" before the years and "Finished, date unknown" after them. Filter-by-title box filters on the client
   per keystroke (gameshelf 2026-09-18). Selection checkboxes with bulk shelf
   change.
2. **Search** — one box, Open Library results, Hardcover's (for what Open
   Library lacks) and local works interleaved, clearly marked. ISBN typed or pasted goes straight to the edition. A result
   already on your shelf links to its entry.
3. **Work page** — cover, summary, series position, editions.
4. **Edition page** — your entry, shelf, rating out of ten, review, reads, the
   Book | Audiobook correction, and add to / remove from shelf (two-step).
   Both have "Back to shelf" at the top — back to the view and the scroll
   position you left (gameshelf has the same) — and, under the cover, "Change
   cover" and "Edit details". Details are their own page: `/work/{slug}/edit`
   for the book, `/edition/{id}/edit` for the book and that edition together,
   one Save, back to the book.
   Delete, at the foot of both, deletes rather than removes from the shelf,
   behind its own page (2026-10-20). On an edition it asks "The whole book"
   (the default) or "Just this edition"; a book's last edition only goes with
   the book. A series or collection left empty goes too, and a tag left on
   nothing.
5. **Series page** — ordered works, your shelf state for each, the
   series' collection, "Mark all N finished" on a day, Rename, Remove the
   series, and Take out on each book. **Collection page** — its series and books, as above.
6. **Settings** — account name and password, export, import, cover art review,
   and **Books not on your shelf** (`/off-shelf`, Jay, 2026-10-21, as
   gameshelf): every book with no entry of yours on any edition, which the
   shelf therefore never shows — mostly books taken off it, and any left with
   no edition. Each goes on a shelf in one press (when it has one edition),
   opens, or is deleted (back to the list). `lib/books/off-shelf.ts`.

Out of scope for v1: social features, reading challenges, page-by-page progress
tracking, quotes/highlights, recommendations, stats dashboards.
Note them in `IDEAS.md` and move on.

A companion phone app is in scope as of 2026-10-13, shared with gameshelf. It
talks to a JSON API under `app/api/v1` (README, "JSON API"), which calls the
same `lib/` code the server actions do and adds no rules of its own.

### Reads

Books are the one place this model differs in practice from gameshelf, which
removed its plays UI. "When did I finish this" is a core Goodreads question and
the Goodreads export carries it, so reads stay visible — but minimal:

- Moving an entry to **finished** closes its open read today, or creates a read
  finished today if none is open. One click. The date is editable afterwards,
  never asked for up front.
- Marking **reading** creates an open read started today, unless one is open.
- Choosing the shelf an entry is already on does nothing (no second finish).
- **Did not finish** and **to read** leave reads alone; an abandoned read stays
  open, which is what did-not-finish means.
- "Read again" adds a new read. No page counts, no percentages, no hours.
- **A series read** (2026-10-17, asked for comics, offered on every series):
  the series page finishes every book in it on one day you give, starting
  at today — asked up front because a run is logged after the fact.
  Already finished is left alone (so twice changes nothing); otherwise your
  entry goes to Finished by the rules above (the one you are reading first);
  a book of the series not on your shelf goes on it in its first edition. An
  open read started after that day finishes the day it started.
- The shelf can sort by last finished. A single line on the shelf — "31 finished
  in 2026" — is the entire stats feature. No stats page.

### Add flow

There is **one** add flow. It always produces an edition attached to a work.

```
Door A — "Add" in the top bar: "Add book" | "Add comic or graphic novel"
  └ Book              → Open Library + Hardcover search (or ISBN) → pick work →
                        Book | Audiobook → pick edition from their list, or
                        "any edition" which creates a plain one named
                        "Book" or "Audiobook"; or "Create it manually"
  └ Comic             → Comic Vine search → pick volume → pick issues (§4c)

Door B — "Add edition" on an existing work page
  work already known; straight to kind + details
```

Door B is Door A with the work pre-filled. Build the form once. Do not write two
components.

**Details are looked over before anything is saved** (Jay, 2026-10-21, with
gameshelf). Every add page for a book not here yet shows the catalogue's
title, subtitle, authors, sort, year, summary, series and number (the edit
page's fields, `BookDetails`), and a box to choose a different cover after
adding (it lands on the edition's cover page). Only a work the add creates
takes them (`BookDraft`, `lib/books/draft.ts`); one already here keeps its
own. A comic run's series is its volume's and is not asked; several issues
at once are added as Comic Vine has them, and one chosen can be looked over
first (`/add/comic/{volumeId}?issue=`). The number has a "Latest" tickbox
(Jay, 2026-10-26): one past the highest whole number in that series (after
2.5 comes 3), or 1, worked out on Add and previewed in the box; the API
takes `position: "latest"`. The phone reads `details` from the
catalogue routes and sends them back with `POST /entries`.

**Book or audiobook** is a two-option toggle on the form, not a dropdown, and it
is on every path that creates an edition (Door A, Door B, by hand). It
defaults to whichever you picked last. It is the whole of
`editions.format` — there is no hardcover/paperback/ebook split. Choosing
Audiobook reveals two optional fields, "Read by" (`credit`) and length
(`duration_minutes`); Book hides them.

The same choice appears on the edition page as an edit, since Open Library's
edition data often gets it wrong. Reading the book and then the audiobook is two
editions and two entries, as with any other pair of editions.

On the Book path, the edition picker filters Open Library's editions by the
toggle (their `physical_format` containing "audio" → audiobook, anything else →
book). Open Library works can have hundreds of editions; show format, year
and language, filterable, not a raw dump.

**No publisher on screen** (2026-10-11). Not shown, not edited, and not in
edition names ("Paperback, 1990"; migration `0003` took it out of existing
Open Library names). The column is still filled from Open Library and
exported.

**Default shelf on add:** `tbr`, including for books not yet published. The
picker is visible on the add form. Nothing moves entries between shelves
automatically afterwards — gameshelf tried that and reverted it within a day.

### Import and export

- **Export**: JSON and CSV of everything, from day one.
- **Restore** (Jay, 2026-10-20, as gameshelf): Settings → Export and restore
  reads the JSON export back in (`lib/import/restore.ts`), batched like the
  Goodreads import. Details come from the file; Open Library is asked only
  for `ol_payload` and covers, which are looked up again as on add. A book
  here already (Open Library keys, Goodreads, Comic Vine or Hardcover id,
  else a local work of the same title and authors) is joined, an entry
  already on the shelf is left alone, and series and collections are only set
  where a book has none. The export carries `seriesRun`, `hardcoverId` and
  `comicvineIssueId` for this; older exports restore without them.
- **Import: Goodreads CSV.** This is the realistic starting point for anyone,
  and it is to bookshelf what the Grouvee import was to gameshelf. Map by ISBN13
  → ISBN → title + author search. Rows that cannot be matched become local works
  rather than being dropped, and are listed at the end so they can be fixed.
  - `Exclusive Shelf` → shelf (`to-read` → `tbr`, `currently-reading` →
    `reading`, `read` → `finished`). Other Goodreads shelves → tags.
  - `Binding` containing "audio" (Audible Audio, Audio CD, Audiobook) →
    `audiobook`; everything else → `book`.
  - `My Rating` (0–5) → rating × 2. Zero means unrated, not 0.
  - `Date Read`, `Date Added`, `Read Count` → one read with the date, plus
    undated reads for the remainder.
  - `My Review` → review. Goodreads exports it with HTML; convert `<br/>` to
    newlines and strip the rest.
  - Store `Book Id` in `editions.goodreads_book_id` so re-running the import is
    idempotent.
  - The file picker is an obvious button, and a missing or malformed file is a
    form error, not a 500. (gameshelf shipped both of those bugs.)
  - As built (2026-09-25): the upload is parsed once and the page imports the
    rows in batches of five, as gameshelf's Grouvee import does — no server-side
    job. The tab stays open for the run (≈2 requests a second per new book, so
    800 books is about half an hour); re-running the same file resumes, because
    `goodreads_book_id` makes finished rows instant no-ops.
  - Next caps server-action bodies at 1 MB and answers past it with a 500, so
    `experimental.serverActions.bodySizeLimit` is 21 MB (the import's own limit
    is 20 MB, also checked in the browser). Anything new that uploads through a
    server action inherits this; gameshelf still has the 1 MB cap.
  - A row that fails because Open Library is unreachable **fails**; it is not
    filed as a local work. Only a genuine no-match becomes one.
  - Title and author matching is strict (same title or a subtitle extension,
    and a shared surname): a wrong match looks right, a local work is listed.
  - Custom exclusive shelves named `dnf`, `did-not-finish`, `abandoned`,
    `gave-up` or `dropped` map to did-not-finish; `listened-to` (and
    `listened`, `audiobooks-listened`) map to finished **as audiobooks**,
    whatever Binding says — Jay's export had 33, 15 of them "Hardcover". Any
    other becomes to-read plus a tag of its name.
  - Series come from Goodreads titles ("Guards! Guards! (Discworld, #8)"),
    never over a series already set.
  - Undated reads have neither date. An **open** read is one with a start and
    no finish, so an undated past read is never closed with today's date.

---

## 5b. Visual design

"Living room", chosen 2026-10-13 with gameshelf to replace the flat-slate
look, which read as too blank. The same system in both apps, sage here where
gameshelf has amber, so they read as a pair. gameshelf's CLAUDE.md §5b is the
full description; the differences are below. The one firm rule is that it
must never look like a generic AI product.

### Tokens (`app/globals.css`)

As gameshelf: ground `#263034`, band `#2F3B40`, well `#1E272A`, panel
`#33424A`, line `#3B474C`, line-strong `#55636A`, ink `#F1ECE2`, ink-dim
`#A3ADB1`, plank `#3B474C` / `#5A6970` / `#1C2427`, sticker `#F1ECE2`, danger
`#C0564B`. The accent is **sage `#C9D7B8`**. There is no `--label`: the band
marked fan translations, which are gone (§1).

### Type

- **Archivo**, one variable family across its width axis: `font-display`
  (125%, 800) for headings, `font-narrow` (87.5%) for metadata.
- **Newsreader** for book titles on the edition and work pages and in the
  Reading now band, reviews, summaries, and the typeset placeholder covers.
- **Plex Mono** for ISBNs, Open Library keys and the rating sticker.
- Sentence case. No all-caps, no tracked eyebrows.

### Layout

- **Shelves** (`/`): the "Reading now" band (cover, title, Finished it, Did
  not finish), then a sideways strip per shelf (To read, Recently finished,
  Did not finish) on a plank, with "See all"; then a Series strip, one tile
  per series (its first book's cover with two edges behind it, the name and
  "2 of 3 finished" above), opening the series page, with "See all by
  series" (2026-10-20, as gameshelf). Finished it asks for a rating
  out of ten on the way, which can be skipped (Jay, 2026-10-20), and Recently
  finished runs newest finish first. The "N finished in 2026" line sits at
  the bottom. It is an overview: the band and every strip show ten at most
  (Jay, 2026-10-20), with "See all N" for the rest.
  A cover here (band or strip) opens a quick shelf panel rather than the
  book (Jay, 2026-10-21, with gameshelf): the shelf as a segmented control,
  Finished going by way of the rating as Finished it does (reads follow as
  on the book's page), and "Open the book". The band's title still opens
  the book, and a folded comic run still opens its series.
  `quick-shelf.tsx`; the wall's covers open the book as before.
- **The wall** (`/?show=all`, any shelf, or a tag; `view` stays grid/list):
  2:3 covers in a grid whose columns come from its own width, a plank under
  every row. Filters in one sideways-scrolling row on a phone. **All
  shelves** in the nav (header and tab bar) is the wall grouped by shelf,
  each shelf in full under a heading that opens it alone.
  The wall remembers its sort, grouping and grid or list (the `bookshelf-preferences` cookie,
  written only when you change them in the filter row; Jay, 2026-10-21), so
  All shelves opens grouped by shelf only until you pick another grouping.
  A link that names a value still wins for that visit without changing what
  is remembered. Which shelf, tag or platform you filtered to is not kept.
- **Edition and work pages**: the whole cover standing on a plank beside the
  title; Change cover and Edit details directly beneath; the shelf as a
  segmented control; rating as ten bars climbing left to right.
- Covers are always whole, at every size: no spines, no cropped banners.
- On hover-capable screens a tile shows its name and shelf on hover; on a
  phone a cover is a plain tap. That text stays on the cover (2026-10-21):
  the title clamped to three lines, more than two authors as "First and N
  others", the rating sticker above it.
- **Phones**: a bottom tab bar (Shelves, All, Search, Add, More). `GAMESHELF_URL`
  puts a link across to gameshelf in the header.

### The typeset placeholder

A book with no art gets a generated cover, not a grey box: `--panel` ground,
the title in Newsreader set large and left-aligned, the author beneath in
narrow Archivo `--ink-dim`, a single `--line` rule between them. Rendered as
HTML in the cell, not a stored image, so it follows title edits. No band,
badge or marker on any cover beyond the rating sticker and a folded comic
run's stack: two hard-edged issue edges behind its cover (`.run-stack`), the
shelf's own physics rather than a label. No icon per format.

### Icons

The rating sticker as the icon (Jay, 2026-10-20): a sage sticker, tilted
left, with a heavy Archivo "B" in `--ground`, on a ground tile. gameshelf's
is an amber "G" tilted right; the phone app overlaps the two. `app/icon.svg`
is the source; `favicon.ico`, `apple-icon.png` and `public/icons/` (the
`manifest.ts` icons) are drawn from it. Redraw all of them together.

### Motion and don'ts

As gameshelf §5b. One orchestrated moment as the shelf resolves, on arrival
only; otherwise motion only answers an action. No cream-and-terracotta, no
near-black-and-acid, no gradient washes, no soft-shadow cards, no emoji or
icon sets, no arrows on buttons.

## 6. Development

WSL2 is already set up from gameshelf. `bootstrap-wsl.sh` is idempotent and
skips everything that exists; running it here seeds `~/code/bookshelf`.

```bash
# In WSL2 (Ubuntu 24.04)
cp .env.example .env      # then fill in; see below
docker compose up -d db   # Postgres on 5433, so it coexists with gameshelf's
npm run db:migrate        # builds the schema, view and trigger included
npm run db:seed           # first user from ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev -- -p 3001    # http://localhost:3001
```

- Repo lives in the WSL2 filesystem (`~/code/bookshelf`), **not** `/mnt/c/`.
- `.gitattributes` sets `* text=auto eol=lf`.
- Compose checks every required variable in the file, not only the started
  service's, so even `up -d db` fails until `SESSION_SECRET` and
  `ADMIN_PASSWORD` are set in `.env`.
- A fresh database is built with `npm run db:migrate`, never `db:push`: push
  cannot create the extensions, the `touch_updated_at` trigger or the
  `entry_cards` view, and fails on the first `uuid_generate_v4()` default.
  `db:push` is fine for iterating on tables afterwards; `db:generate` and commit
  a migration before anything is deployed.
- `schema.sql` stays the source of truth. After changing it, mirror the change
  in `lib/db/schema.ts`; a view or trigger change also goes into the migration by
  hand, since `augment-migration.py` only handles the first one.

### Carried over from gameshelf — set these up in step 1, not after the bug

- `npm run check:actions`: a `"use server"` file that exports anything other than
  an async function silently breaks every action on the page. Copy
  `scripts/check-actions.ts` from gameshelf and run it in CI.
- A root `error.tsx` boundary and a `not-found` for missing slugs.
- The schema's view, trigger function and extensions do not come out of
  `drizzle-kit generate`; gameshelf's `scripts/` has the augment step that lifts
  them from `schema.sql` into the first migration. Reuse it.

---

## 7. Deployment

Same shape as gameshelf. Read its README; the steps below are only the
differences.

- Image built by GitHub Actions and published to `ghcr.io/iron-jay/bookshelf`.
  The VM only pulls. One image; it applies migrations on start before serving.
- A self-hosted runner on the VM (label `shelf-vm`) deploys each `main`
  build: the `deploy` job in `publish.yml`, off until the repository variable
  `DEPLOY_DIR` is set (README, "Deploying on push").
- Can share gameshelf's Debian VM. App on `3001`, its own Postgres container, its
  own `../bookshelf-data/` for `pgdata` and `covers`. If it gets its own VM
  instead: the Debian cloud image root partition is ~3 GB regardless of the
  Proxmox disk size — grow it before the first `docker compose up`.
- Compose caps container logs (`max-size`) — a crash loop filled gameshelf's disk.
- Ports bind to `127.0.0.1` by default; the reverse proxy reaches them over
  loopback.
- `AUTH_DISABLED=true` skips sign-in for a private network, as gameshelf.
- First user defaults to `admin`; name and password changeable in Settings.
- Env vars: `DATABASE_URL`, `SESSION_SECRET`, `ORIGIN`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD`, `AUTH_DISABLED`, `COVERS_DIR`, `OPENLIBRARY_CONTACT`,
  optional `GOOGLE_BOOKS_API_KEY`, `HARDCOVER_API_TOKEN`, `COMICVINE_API_KEY`
  and `GAMESHELF_URL`.
- `pg_dump` nightly via cron alongside gameshelf's.

---

## 8. Conventions

- **`PROGRESS.md`** is the dev log. Append a dated entry at the end of every
  working session: what changed, what broke, what is next. Read it at the start
  of every session before doing anything else.
- When a decision changes something in this brief, change the brief in the same
  session. A brief that contradicts the app is a trap for the next session.
- Commits are conventional (`feat:`, `fix:`, `chore:`), present tense.
- One migration per logical change, never squashed after being applied.
- Server actions live next to the route that uses them; shared logic in `lib/`.
- No `any`. No `@ts-expect-error` without a comment explaining the plan.
- Comments explain *why*, never *what*.

---

## 9. Build order

Work through these in sequence. Do not start the next until the previous one
runs end to end.

1. Scaffold, Docker Compose, Postgres up, Drizzle schema matching `schema.sql`,
   the check scripts from §6.
2. Auth: first user seeded from env, login, session cookie, `AUTH_DISABLED`.
3. Open Library client + search page, including ISBN. Nothing persists yet.
4. Add-to-shelf: creates work, edition and entry in one transaction; cover
   downloaded; lands on `tbr` unless another shelf is picked.
5. Shelf page with shelf filtering, filter-by-title, typeset placeholders.
6. The unified add form (§5) for manually created works and editions.
   Verify one end to end through Door A, then another through Door B on an
   existing work page. If the two paths need different code, stop and fix
   the form before continuing. (Built for fan translations, since removed.)
7. Edition page: rating out of ten, review, reads.
8. Series: assign on the work page, series page, group-by-series on the shelf.
9. Tags, bulk selection.
10. Export, then Goodreads import.

Ship after 7. Import is last in the list but is what makes the app usable with a
real library — do it before calling v1 done.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
