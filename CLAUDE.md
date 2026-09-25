# bookshelf — Project Brief

Self-hosted book tracker. Goodreads' interaction model, Open Library's
catalogue, and first-class support for the thing neither of them handles well:
fan translations.

Sibling of **gameshelf** (`github.com/iron-jay/gameshelf`). Same stack, same
deployment shape, same design language. Where this brief is silent, do what
gameshelf does. Where the two disagree, this brief wins for this repo.

Single-user by default, multi-user capable. Runs as two containers on a home
server. No SaaS dependencies, and no API keys required to run.

---

## 1. Non-negotiables

These shape every other decision. Do not quietly relax them.

1. **Fan translations are equal citizens.** A fan translation of a light novel
   must be as easy to create, shelve, rate and review as a Penguin paperback.
   No second-class "custom book" flow bolted on the side.
   - Fanfic, podfic and fan edits were dropped on 2026-09-25, after the shelf
     was built: not wanted. Migration `0001` removed their edition kinds and
     `works.derived_from_work_id`. Do not reintroduce them; a book Open Library
     lacks is a manually created work, not a fanwork.
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

work        Mushoku Tensei vol. 1                   (openlibrary)
 └ edition   Web novel (fan TL)        fan_translation  (local, base = JP edition)
```

This is Open Library's own model — works and editions — so the mapping from
their API is mechanical. That is deliberate; do not invent a third level.

### Two relations, and they are not the same thing

Each link means something different:

- `works.series_id` + `series_position` — **reading order**. Discworld #8.
  Positions are `numeric` because novellas are 2.5.
- `editions.base_edition_id` — **the same text, differently**. Translations,
  audiobooks of a specific text, fan translations.

An edition never changes the story. A different story is a different work. If a
proposed feature blurs these, the feature is wrong, not the model.

Consequences to honour in the UI:

- A series page is an ordered list of works with your shelf state beside each.
  That is the whole feature.
- Shelf grouping includes **series** (in order) and **author**.

Rules:

- A **work** is the abstract book. `ol_work_key` (`OL45804W`) is unique and
  nullable. `source = 'local'` works exist for things Open Library has never
  heard of — web serials, zines, out-of-print things.
- An **edition** is what you actually read or listened to. Every work has at
  least one. Derived editions set `base_edition_id` to the text they translate
  or narrate.
- An **entry** is unique per `(user_id, edition_id)`. Rating and review live
  here, so you can rate the fan translation differently from the official one.
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
"a new table", push back on the feature first. `series` is the one table added
over gameshelf's shape, and it earns it: series order is how people read.

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
4. **Typeset placeholder** — see §5b. Not an error state: a lot of books,
   and most fan translations, will live here permanently and should look
   deliberate.

Rules carried over from gameshelf, because they were learned the hard way:

- **A community edition never inherits the work's cover.** A fan translation
  shown with the official English cover looks correct and is wrong. Own art or
  placeholder. The `entry_cards` view enforces this; do not undo it in the app.
- Auto-lookup runs once on add and never re-runs on its own. Refresh is a manual
  action, so art you approved is never silently replaced.
- Covers needing review get their own page at `/art`, linked from Settings. Not a
  filter on the shelf.
- Download on add, store under `COVERS_DIR`, serve locally.

### Adding a fan translation (the important flow)

From any work page: **Add edition** → kind, name, base edition, credit, URL,
language, notes. That is it. No approval, no moderation. It is your server.

From search: if nothing matches, **Create work manually** with the same minimal
form. Used for web serials, zines, ARCs, out-of-print things.

---

## 5. Screens (v1 scope)

1. **Shelf** — the home page. Grid or list, filter by shelf and tag, group by
   series / author / year / book-or-audiobook. Filter-by-title box filters on the client
   per keystroke (gameshelf 2026-09-18). Selection checkboxes with bulk shelf
   change.
2. **Search** — one box, Open Library results and local works interleaved,
   clearly marked. ISBN typed or pasted goes straight to the edition. A result
   already on your shelf links to its entry.
3. **Work page** — cover, summary, series position, editions.
4. **Edition page** — your entry, shelf, rating out of ten, review, reads, the
   Book | Audiobook correction, and add to / remove from shelf (two-step).
5. **Series page** — ordered works, your shelf state for each.
6. **Settings** — account name and password, export, import, cover art review.

Out of scope for v1: social features, reading challenges, page-by-page progress
tracking, quotes/highlights, recommendations, stats dashboards, mobile app.
Note them in `IDEAS.md` and move on.

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
- The shelf can sort by last finished. A single line on the shelf — "31 finished
  in 2026" — is the entire stats feature. No stats page.

### Add flow

There is **one** add flow. It always produces an edition attached to a work.

```
Door A — "Add book" in the top bar
  type selector: Book | Fan translation
  └ Book              → Open Library search (or ISBN) → pick work →
                        Book | Audiobook → pick edition from their list, or
                        "any edition" which creates a plain one named
                        "Book" or "Audiobook"
  └ Fan translation   → name first, then source work, then details

Door B — "Add edition" on an existing work page
  work already known; straight to kind + details
```

Door B is Door A with the work pre-filled. Build the form once. Do not write two
components.

**Book or audiobook** is a two-option toggle on the form, not a dropdown, and it
is on every path that creates an edition (Door A, Door B, fan translation). It
defaults to whichever you picked last. It is the whole of
`editions.format` — there is no hardcover/paperback/ebook split. Choosing
Audiobook reveals two optional fields, "Read by" (`credit`) and length
(`duration_minutes`); Book hides them.

The same choice appears on the edition page as an edit, since Open Library's
edition data often gets it wrong. Reading the book and then the audiobook is two
editions and two entries, as with any other pair of editions.

On the Book path, the edition picker filters Open Library's editions by the
toggle (their `physical_format` containing "audio" → audiobook, anything else →
book). Open Library works can have hundreds of editions; show publisher, year
and language, filterable, not a raw dump.

**The source work for a fan translation** is picked by inline search: Open
Library or a work already here. When it is neither — a web novel Open Library
has never heard of — the same form creates it as a local work first. A fan
translation always has a source text; if there isn't one, it is not a fan
translation.

**Default shelf on add:** `tbr`, including for books not yet published. The
picker is visible on the add form. Nothing moves entries between shelves
automatically afterwards — gameshelf tried that and reverted it within a day.

### Import and export

- **Export**: JSON and CSV of everything, from day one.
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
    `gave-up` or `dropped` map to did-not-finish; any other becomes to-read
    plus a tag of its name.
  - Series come from Goodreads titles ("Guards! Guards! (Discworld, #8)"),
    never over a series already set.
  - Undated reads have neither date. An **open** read is one with a start and
    no finish, so an undated past read is never closed with today's date.

---

## 5b. Visual design

Same system as gameshelf, so the two apps read as a pair. The differences below
are deliberate.

### Tokens

```
--ground    #2E3439   mid-slate page, as gameshelf
--panel     #373E44
--line      #464E55
--ink       #E8E6E1
--ink-dim   #98A1A8
--label     #6F9A8D   muted verdigris. Community provenance only.
```

Same ground, different label. The ochre belongs to gameshelf; a different hue
here means a screenshot of either is identifiable at a glance. `--label` is still
the only chromatic value in the app and still means exactly one thing: this
edition is unofficial. Never buttons, links, focus or emphasis.

### Type

- **Archivo** and **Archivo Narrow** for the interface, as gameshelf.
- **Newsreader** (serif, 400 and 500, italic for titles in running text) for two
  things only: reviews and summaries — long-form prose meant to be read — and
  the typeset placeholder covers. Not headings, not nav.
- Mono only for literal codes: ISBNs, Open Library keys.
- Two weights. Sentence case. No all-caps, no tracked eyebrows.

### Layout

Covers flush in a dense grid, 4px gaps (gameshelf settled on 4px, not 1px). No
radius, no shadows, no hover lift. Metadata on selection. On hover, the title and
author; for a community edition, its own name first and the source work as the
subtitle.

Book covers are 2:3 and often inconsistent in ratio. `object-fit: cover` into a
fixed 2:3 cell; do not letterbox.

### The typeset placeholder

A book with no art gets a generated cover, not a grey box: `--panel` ground, the
title in Newsreader set large and left-aligned, the author beneath in Archivo
Narrow `--ink-dim`, a single `--line` rule between them. Rendered as HTML in the
cell, not a stored image, so it follows title edits. A good placeholder makes a
shelf of web-novel translations look like a shelf rather than a gap.

### The label band

As gameshelf: community editions — here only `fan_translation` — render a solid
`--label` band across the lower portion of the cover,
carrying the edition's name and credit in Archivo Narrow. Official editions get
no band, no badge, no marker. The absence is the signal. Do not extend it into a
system — no band for audiobooks, no icon per format.

### Motion and don'ts

Unchanged from gameshelf §5b. One orchestrated moment as the grid resolves;
otherwise motion only answers an action. No cream-and-terracotta, no
near-black-and-acid, no rounded cards with soft shadows, no arrows on buttons.

---

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
  optional `GOOGLE_BOOKS_API_KEY`.
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
6. The unified add form (§5) for fan translations and manually created works.
   Verify a fan translation end to end through Door A, then another through
   Door B on an existing work page. If the two paths need different code, stop and fix the
   form before continuing.
7. Edition page: rating out of ten, review, reads.
8. Series: assign on the work page, series page, group-by-series on the shelf.
9. Tags, bulk selection.
10. Export, then Goodreads import.

Ship after 7. Import is last in the list but is what makes the app usable with a
real library — do it before calling v1 done.
