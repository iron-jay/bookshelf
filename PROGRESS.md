# bookshelf — dev log

Read the latest entry before starting. Append a dated entry at the end of every
working session: what changed, what broke, what is next.

---

## 2026-09-25 — Step 1: scaffold, Postgres, schema, check scripts

Scaffolded by copying gameshelf's setup rather than running create-next-app:
same Next 16.3.5 / React 19.2.8 / Drizzle 0.45 / Tailwind 4 versions, same
tsconfig, eslint, postcss and drizzle configs, same `lib/db/index.ts` (lazy pool
pinned to `globalThis`, so `next build` needs no database).

**Carried over from gameshelf as §6 asks:**

- `scripts/check-server-actions.ts` → `npm run check:actions`. Runs in the
  Dockerfile's build stage, so the GHCR workflow fails on it. Proven with a
  probe file exporting a constant: exit 1, file and line named.
- `scripts/augment-migration.py`, unchanged — the object names (`entry_cards`,
  `works_touch`, `entries_touch`, `touch_updated_at`) happen to be the same in
  both schemas.
- `app/error.tsx` (asks `/health` to tell "database down" from "our bug") and
  `app/health/route.ts`. gameshelf has no `not-found`; `app/not-found.tsx` is new.
- `Dockerfile`, `.dockerignore`, `.github/workflows/publish.yml` with its smoke
  test, `scripts/migrate.ts` for the image.

**Schema.** `lib/db/schema.ts` mirrors `schema.sql`; `drizzle/0000_init.sql`
generated and augmented. Checked by building a second database straight from
`schema.sql` and diffing `pg_dump --schema-only` of the two: identical except
foreign key names (drizzle writes `_fk`, Postgres `_fkey`; inline
`.references()` cannot name them). Every column, check, index, the trigger and
the `entry_cards` view match. `series_position` is `numeric` in `mode: "number"`
so 2.5 arrives as a number, not a string.

**Design tokens** in `globals.css`: gameshelf's ground, `--label` verdigris
`#6F9A8D`, Newsreader loaded as `--font-serif` for reviews, summaries and
placeholders. gameshelf's `--color-danger` was *not* carried over — this brief
says `--label` is the only chromatic value. Decide when deletion arrives.

**What broke:**

- `tsx scripts/migrate.ts` fails on top-level await (the package is CJS). Dev
  uses `drizzle-kit migrate`, as gameshelf does; `migrate.ts` is only ever run
  as the esbuild ESM bundle. Both write the same `drizzle.__drizzle_migrations`,
  and running the bundle after `db:migrate` correctly reports up to date.
- The brief said `db:push` in dev. Push cannot create the extensions, view or
  trigger, so §6 now says `db:migrate` for a fresh database.
- `docker compose up -d db` refuses to start without `SESSION_SECRET` and
  `ADMIN_PASSWORD`, because compose interpolates the whole file. Documented in
  `.env.example` and §6. A dev `.env` with generated secrets exists locally.

**Verified:** `typecheck`, `lint`, `check:actions`, `next build` (no database)
and `build:migrate` all clean. Migrations apply and re-apply idempotently. Dev
server on 3001: `/` queries `works` and renders "0 works in the catalogue";
`/health` is `{"database":true}`, then 503 `{"database":false}` with the db
container stopped; an unknown URL is a 404 with the not-found page; the pool
recovers once Postgres is back. With the database down `/` returns 500, but the
error boundary renders client-side and was not seen in a browser.

**Not done:** README (gameshelf's is the deploy reference for now); the first
user seed in `migrate.ts` and `@node-rs/argon2` arrive with auth.

**Next:** step 2, auth — copy `lib/auth` from gameshelf, seed the first user in
`migrate.ts`, login page, session cookie, `AUTH_DISABLED`.

---

## 2026-09-25 — Step 2: auth

gameshelf's auth, copied: Argon2id at OWASP's reference cost, a 32-byte random
token in the cookie with only its SHA-256 in `sessions`, 30-day sliding expiry
written once past halfway, a decoy verify so an unknown username costs the same
as a wrong password, and the `(app)` route group guarded in its layout rather
than middleware.

**Three deliberate differences from gameshelf:**

- **One first-user rule.** gameshelf's `seed.ts` checked for a user *named*
  `ADMIN_USERNAME` while its `migrate.ts` checked for *anyone*, so after a
  rename in Settings `db:seed` would have created a second account.
  `lib/auth/first-user.ts` holds the "anyone at all" rule and both
  `scripts/migrate.ts` (image start-up) and `scripts/seed.ts` (`npm run
  db:seed`, dev) call it. Worth backporting to gameshelf.
- **Cookie is `bookshelf_session`.** Cookies are scoped by host, not port, so on
  the same box the two apps would have signed each other out.
- **No redirect loop with sign-in off and nobody seeded.** The layout sent you
  to `/login`, which saw `AUTH_DISABLED` and sent you back. The login page now
  counts users first and shows the "no user yet" message instead. gameshelf
  still has this loop.

The nav holds only the shelf link and sign-out; Search, Add and Settings join it
as their steps land, so it never links to a 404.

`SESSION_SECRET` is required by compose but nothing reads it — true of
gameshelf too, since sessions are random tokens looked up in the database rather
than signed. Left in place for parity.

**Verified** against the dev database, from empty:

1. No user, sign-in on: `/` → 307 `/login`, which says no user exists.
2. No user, `AUTH_DISABLED=true`: one redirect to `/login`, 200, same message.
   No loop.
3. The bundled `migrate.mjs` twice: "created admin", then "already exists".
   Hash is `$argon2id$`.
4. Sign-in off with a user: `/` is 200 showing "admin · sign-in off";
   `/login` → `/`.
5. Sign-in on, via the real form posted as a no-JS browser would: wrong password
   and unknown user both "Username or password is incorrect", no session rows.
6. Right password: 303 to `/`, `bookshelf_session` cookie is HttpOnly, one row
   whose id is the token's SHA-256 (64 hex), expiring in 30 days. `/` shows
   Sign out; `/login` bounces to `/`.
7. Sign out: 303 to `/login`, row deleted, cookie cleared, `/` redirects again.
8. Timing, five of each after warm-up: wrong password 51–57 ms, unknown user
   49–56 ms.
9. Renamed `admin` → `jay`, ran `db:seed` and `migrate.mjs`: both "jay already
   exists", still exactly one user. Renamed back.

`typecheck`, `lint`, `check:actions` (2 files), `build` and `build:migrate`
clean. After moving `app/page.tsx` into `(app)`, `tsc` failed on stale
`.next/types` until `.next` was cleared — a build artefact, not a code problem.

**Next:** step 3, the Open Library client (`lib/openlibrary/`, serialised at
~1/s with the identifying User-Agent) and the search page, ISBN included.
Nothing persists yet.

---

## 2026-09-25 — Step 3: Open Library client and search

**`lib/openlibrary/`** is the only code that reaches openlibrary.org (grepped).
`client.ts` runs every request through one queue spaced 1s apart
(`lib/rate-limit.ts`, from gameshelf), sends `bookshelf/<version> (<contact>)`,
times out at 15s, returns `null` for 404 and throws `OpenLibraryError` for
everything else — so "the network is down" can never read as "no such ISBN".
`normalise.ts` holds the field rules; `index.ts` exposes `searchWorks` and
`lookupIsbn`. Nothing in it writes to the database.

- **Languages:** Open Library's MARC codes (`ger`, `fre`, `chi`) go through
  `Intl.getCanonicalLocales`, which already maps them to `de`, `fr`, `zh`. No
  table. `mul` and `und` are null.
- **Format:** "audio" anywhere in `physical_format` → audiobook, else book,
  missing included — the brief's rule, and `format` is never null.
- **Years:** `publish_date` is free text; the year is pulled out with digit
  lookarounds so `c1991` and `[1991?]` work. The first version used `\b` and
  missed `c1991`; my own test expected the wrong answer and passed. Fixed.
- **ISBN lookup:** `/isbn/` then `search.json?q=key:/works/…` for the work, which
  carries author names where `/works/` has only keys. Brief §4 updated.

**`lib/isbn.ts`** parses what people paste (hyphens, spaces, "ISBN:", lowercase
x), checks the check digit, and gives both forms (978 only for ISBN-10). A
well-formed ISBN with a wrong check digit is searched as text with a notice
saying it looks like a typo.

**`/search`**, now in the nav:

- One list, not two blocks. An Open Library result already on this server is
  shown once, as the local row with your shelf state. Everything is then
  ranked in three coarse tiers (exact title, title prefix, every word in title
  or authors) with Open Library's order kept within a tier. That is what gets
  a local fic up among 20 remote results.
- Marked "Open Library", "Open Library · saved here" or "Local work", plus
  "On your shelf". Plain `--ink-dim` text: `--label` means community edition
  and nothing else.
- Local works are searched first, with every word required across title and
  authors, `%` and `_` escaped. Offline, local results still come back with a
  notice.
- An ISBN checks local editions (`isbn13` or `isbn10`) before Open Library,
  so a book on this server is found by ISBN with no network.
- Links go to `/edition/{id}` (exactly one entry) or `/work/{slug}`. Neither
  page exists yet — steps 4 and 7 — so those links 404 for now. Open Library
  results have no link or Add until step 4.

**Verified.** Stubbed-fetch tests of the client: three concurrent calls ran
1028ms and 1001ms apart; UA with and without a contact; 404 → null; 429, network
failure, timeout and non-JSON each throw with the right message; a failure does
not jam the queue. 12 ISBN parse cases, 9 year cases. Against the live API and
the dev database (with two `zz-test-` works inserted by hand, since nothing can
add yet): "guards" shows the saved Guards! Guards! once, linked to its entry,
and the local fic interleaved; "pratchett guards" finds it across author and
title; the Corgi ISBN, hyphenated or as ISBN-10, is found locally in 0.1s;
9780141439518 comes from Open Library as Book · Paperback · Penguin Books · 2003
· English · 435 pages in 1.6s; an unknown ISBN says so; a typo'd one says so and
then "Nothing found". With openlibrary.org made unreachable by a preload,
local and cached-ISBN results still work and each failure is a notice. `%` and
`_uards` match nothing. Row counts unchanged by any search; test rows deleted.

Not verified: an audiobook ISBN end to end (the format rule is unit-tested
only); how the page looks, since it was read as HTML rather than in a browser.

**Next:** step 4, add to shelf — work, edition and entry in one transaction,
cover downloaded, `tbr` unless another shelf is picked.

---

## 2026-09-25 — Step 4: add to shelf

Search → **Add** → `/add/book/{olWorkKey}`: Book | Audiobook toggle, Open
Library's editions for that format (filterable, newest first) or "any edition",
shelf picker defaulting to To read. From an ISBN search the edition arrives
chosen and first in the list, fetched on its own if it is past the first 1000
(Pride and Prejudice has 4042).

**`lib/books/add.ts`** does the work, in `lib/` because the Goodreads import
will call it. Network first (only what is not already stored: a cached work
costs no work requests), then one transaction for work, edition, entry and — on
Reading or Finished — a read started or finished today; covers after commit.
Edition keys from the form are checked against the work, since an edition of
another book would file it under this one. "Any edition" is one shared plain
Book or Audiobook per work (`source = 'local'`), not a new one per add.
Re-adding an edition you have changes nothing, shelf included.

**Covers** (`lib/books/covers-on-add.ts`), once, for rows the add created:
Open Library by cover id for the edition and the work; if nothing is on screen,
Google by ISBN (no review), then Google by title + author (flagged for review).
`/covers/{file}` serves them to signed-in users only.

- **Google Books without a key is dead in practice.** The shared anonymous
  quota returned 429 all morning. The code treats it as "no cover" and logs it;
  brief §4a corrected. The success path is tested with a stubbed fetch only.
- `covers.openlibrary.org` redirects twice to archive.org; a missing id is a
  43-byte gif unless `?default=false`. Covers under 1 KB are refused.
- `/covers` is `max-age=3600`, not gameshelf's `immutable`: files are named by
  row id, so a refreshed cover reuses the name.

**Decisions worth knowing:**

- Edition names are built as the brief's example: "Paperback, Corgi Books 1990".
  Lowercase formats get a capital; "eAudiobook" stays as written (the first
  version produced "EAudiobook").
- `published_on` only when Open Library names a day. "1991" is not stored as
  1991-01-01; the year is in the name.
- ISBN-10 and -13 are both stored, one derived from the other when the record
  has only one. An Open Library ISBN failing its checksum is stored as nothing.
- Every Open Library edition lands as `kind = 'original'`, including the German
  ones. Telling an official translation apart needs the original language,
  which Open Library does not reliably give. Changeable on the edition page.
- Author sort: "Pratchett, Terry", "Le Guin, Ursula K.", "del Toro, Guillermo".
  Wrong for family-name-first names; editable when the work page lands.
- `slugify` now keeps any script. gameshelf's made "Белая гвардия" `untitled`;
  and my first rewrite stripped all combining marks, turning 本気だす into
  本気たす. Only U+0300–036F is stripped now, then NFC.
- `COVERS_DIR` must be absolute (gameshelf's rule, which step 1's
  `.env.example` got wrong). Fixed in `.env.example` and the local `.env`.
- The format toggle remembers the last choice in a `bookshelf_format` cookie.
- "Read by" prefills from Open Library's narrator contributors until typed in.

**The form is built for step 6.** `FormatToggle` (with the `locked` state
podfic needs), `AudiobookFields`, `ShelfPicker` and `EditionPicker` are separate
under `app/(app)/add/`; `AddForm` is the Book path and the kinds join it.

**The home page is a stand-in list** off `entry_cards`, so an add has somewhere
to land. Step 5 replaces it.

**Verified** by posting the real form against live Open Library: Corgi paperback
→ Finished with a read today, work and edition both with summary, payload and
two covers, 5.3s; the eAudiobook on the same work with credit and 10h 5m →
Reading, 1.6s since the work was cached; the paperback again → "already", no
change; any edition twice → one plain Book; an edition of another work, a
broken key, 75 minutes, a made-up format → an error each, nothing written; the
ISBN route with the edition preselected at the top of 1000; a work with no
Open Library cover → Google 429, logged, added without art. With Open Library
unreachable: an uncached work is an error and writes nothing, a cached work
still adds as any audiobook. `/covers` is 404 signed out and serves signed in;
the home list shows each edition's own cover and the work's for plain ones.
Unit cases for author sort, slugs (Cyrillic, Japanese), dates and Google.
All test rows and covers deleted afterwards.

**Not verified:** in a browser — the filter, toggle and credit prefill are
client state and were only rendered, not clicked; a Google Books cover actually
downloading; two adds of one new work at the same moment.

**Next:** step 5, the shelf — grid, shelf filter, filter-by-title, typeset
placeholders, label band.

---

## 2026-09-25 — The brief had a block in it nobody wrote

`next dev` in Next 16 appends a `nextjs-agent-rules` block to `CLAUDE.md` when
it detects an AI coding agent (`generate-agent-files.js`, keyed on `CLAUDECODE`,
`AI_AGENT` and similar). Starting the dev server during step 1 wrote it, and
that step's `git add -A` committed it unnoticed in `30d4003`. Removed. Run by a
person, `next dev` writes nothing; run by an agent, start it with those
variables unset (`env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE
-u CLAUDE_CODE_IS_COWORK npm run dev -- -p 3001`).

The two gameshelf auth bugs noted in step 2 are fixed there too (uncommitted in
that repo, logged in its PROGRESS.md). bookshelf already had both fixes.

---

## 2026-09-25 — Step 5: the shelf

`/` is the shelf: tabs per shelf with counts, the "N finished in 2026" line (the
entire stats feature; rereads count, other years do not), sort (recently added,
title, author, rating, last finished), group (author, year, book or audiobook —
series joins in step 8), grid or list, and filter-by-title-or-author on the
client per keystroke. Sort, group and layout are remembered in the
`bookshelf-view` cookie and restored on a bare `/`; which shelf you were on is
not (gameshelf's rule). The nav's "bookshelf" link restores the view. Copied
from gameshelf: `shelf-view.ts`, `filter-form.tsx`, `shelf-link.tsx`,
`remember-shelf-view.tsx`.

**`cover.tsx`** is every cover in the app: a 2:3 cell with `object-cover`, the
typeset placeholder when there is no art, and the label band for community
editions. The placeholder is set in container-query units, so the same
component is a 128px tile and a 48px list thumbnail without the title
overflowing. Newsreader for the title, one `--line` rule, Archivo Narrow author.
In list rows the band keeps its colour but drops its text, which is unreadable
at 48px; the row states the credit instead.

**Headlines** (`shelf-card.ts`): official editions lead with the work and
author; fan translations, podfic and fan edits lead with their own name and the
source work beneath (§5b); a fic leads with its own title — it is a work, and
its edition is only "AO3" — then "author · of {source}".

**Verified** against a shelf of five books added through the real form (Corgi
paperback, eAudiobook, Pride and Prejudice, A Wizard of Earthsea, a play script
with no cover) and four community editions inserted by SQL, since step 6 is not
built: a fic of Guards! Guards!, a podfic of it, a Japanese-titled fan
translation, and a fan translation hung on Pride and Prejudice. From the served
HTML: counts 9/3/2/3/1 and "3 finished in 2026" (today ×2 plus a March reread,
not the 2025 finish); every community edition has placeholder + band with name
and credit, official ones no band; the P&P fan translation does not inherit
the work's cover; hover text in the right order for all three kinds; each sort
and grouping in the expected order (year groups the eAudiobook under 2023 and
the local works under "Year unknown"); list rows; the reading filter; junk
params fall back; a cookie with `status=dnf` restores layout but not the
filter.

Known effect: the Corgi paperback is named "…1990" but groups under 1989. Step 4
stores `published_on` only for full dates, so year-only editions fall back to the
work's year. Right for a reprint; for a translation it would be the original's
year. Revisit if grouping by year matters with real data.

**Not verified — no browser on this machine** (no Chromium or Playwright;
installing one needs a ~150 MB download and likely `sudo apt`). Nobody has
*looked* at it: placeholder proportions, the band's height, the 4px gaps, the
hover overlay, the grid resolving animation. The filter box is client-side and
was never typed into. Tiles link to `/edition/{id}`, which is step 7.

**Next:** step 6, the unified add form — fan translation, podfic, fan edit and
fanfic through the same `AddForm`, Door A and Door B.

---

## 2026-09-25 — Fanfic, podfic and fan edits are out

Looked at the shelf and decided: fan translations are wanted, fanfic, podfic and
fan edits are not. Manual works (for books Open Library lacks) stay — the
Goodreads import needs them for unmatched rows.

- **Migration `0001_drop_fanworks`**: rebuilds `edition_kind` without `fanfic`,
  `podfic` and `fan_edit` (Postgres cannot drop enum values), drops
  `works.derived_from_work_id` with its check and index, and drops the podfic
  audio check. `entry_cards` depends on both, so the migration drops it first
  and recreates it from `schema.sql`. A guard at the top refuses to run while
  any rows of the dropped kinds exist, rather than failing on a cast; it is a
  person's data and not a migration's call.
- `schema.sql`, `lib/db/schema.ts`, the view (`derived_from_title` gone,
  `is_community_edition` now means fan translation), the shelf's headlines and
  the format toggle's podfic-only `locked` state all follow.
- The brief: non-negotiable #1 is now about fan translations and records the
  removal; the data-model tree, "two relations", the add flow (Door A is
  Book | Fan translation), the label band and step 6 are rewritten. A fan
  translation whose source is not on Open Library creates the source as a local
  work in the same form.

**Verified.** The guard, on a scratch database built from `0000` with a fic in
it: the migration stopped with its message and rolled back — view present, fic
present, one migration recorded. The dev database (test fic and podfic deleted
first — they were `zz-test-` rows) migrated, and re-running is a no-op. A fresh
database from both migrations matches `schema.sql` exactly apart from the known
FK names, and the migrated dev database is identical to it. The shelf still
draws both fan translations with band and placeholder; an audiobook added
through the form after the migration.

**Next:** step 6 — now just fan translations and manual works through the one
`AddForm`, Door A and Door B.

---

## 2026-09-25 — Step 6: the unified add form, and a work page

**One form for typed-in editions** (`app/(app)/add/edition-form.tsx`, action
`addEditionAction`, logic `lib/books/add-edition.ts`). Door A is `/add`
("Add book" in the nav): Book | Fan translation. Door B is `/add?work={id}`
("Add edition" on a work page): the same component with the work fixed and a
Kind select. Both post to the same action; there is no second path.

- **Door A, Book** is a search box first — a book Open Library has is better
  added from Open Library — with "Create it manually" (title, comma-separated
  authors) for zines, ARCs and out-of-print things. Search offers the same way
  out after every text search, with the typed title carried across.
- **Door A, Fan translation**: name, then "Translation of" (inline search via
  the `findSourceWorks` server action: works here first with their editions,
  then Open Library, deduplicated; still answers offline), then details. "Not
  listed" turns the search into title and author fields and the same submit
  creates the source as a local work.
- **Details**: Book | Audiobook; one credit field labelled by kind and format
  ("Translated by" for any translation, else "Read by" for audiobooks — a
  translated audiobook names its translator); length for audiobooks; base
  edition from the work's editions on this server; language from a list of 27
  (codes stored, names shown); link (http/https only); notes; shelf.
- A fan translation never gets a cover looked up: own art or the placeholder.
  A work created on the way still gets its own (Open Library, or Google by
  title for a local one, flagged for review).
- Typed-in editions are always new rows — two fan translations of one book
  are two editions — unlike the Open Library path's shared "any edition".

**Refactor**: work creation (`lib/books/works.ts`: fetch and insert Open Library
works, insert local ones) and shelving (`lib/books/shelving.ts`: entry plus the
read for Reading or Finished) moved out of `add.ts`, which now uses them too.
`AudiobookFields` split into `CreditField` and `LengthField`.

**`/work/[slug]`**: cover, title, authors, year, source and Open Library key,
summary in Newsreader, and every edition with kind, language, credit and your
shelf state; fan translations show the band and never the work's cover. "Add
edition" (Door B) and, for Open Library works, "Add one of Open Library's".
Series position waits for step 8.

**Verified** by posting the real form for each path against the dev database:

- Door A fan TL with an uncached Open Library source (a Bookworm light novel):
  work cached with payload and its cover, fan TL edition with credit, language
  and URL and no cover, read started.
- Door A fan TL on Guards! Guards! (already here), translated from the Corgi
  paperback; Door A fan TL whose source is not on Open Library → "Lord of the
  Mysteries" created as a local work, the TL as a 40-hour audiobook.
- Door A manual book: "Zine #3" with two authors, plain Book edition, read
  started.
- Door B fan TL on Guards! Guards! — same action as the Door A one — shelved
  Finished with a read today; Door B plain audiobook on the zine with the name
  left blank → "Audiobook", 90 minutes.
- Eight bad inputs (fan TL without a name, `javascript:` link, unknown
  language, base edition from another work, the dropped `fanfic` kind, a
  missing work, 90 minutes, an empty manual title): an error each, row counts
  unchanged.
- `findSourceWorks` called through Next's action endpoint: local first with
  editions, Open Library deduplicated, CJK queries work, one-character queries
  return nothing.
- The shelf draws all four new fan translations with band and placeholder; the
  work page lists Guards! Guards!'s four editions correctly.

**Limits:** a base edition can only be one already on this server, so a source
work fetched from Open Library on the way has none to offer yet (settable once
editing exists). Author sort misreads pen names ("Diving, Cuttlefish That
Loves"). Not clicked in a browser: the Door A tabs, the debounced source search
and "Not listed" are client state.

**Next:** step 7, the edition page — rating out of ten, review, reads. Ship
after it.

---

## 2026-09-25 — Step 7: the edition page

`/edition/[id]`, where every shelf tile and work-page row already pointed. Cover
(fan translations: own art or placeholder, with the band), the edition's name
and work, the facts that exist (kind, credit labelled by kind and format,
"translated from" linking the base edition, language, publisher, date, pages,
length, ISBN and Open Library key in mono, link), and the Book | Audiobook
correction. Then your entry: shelf, rating out of ten (whole numbers; the
chosen one clears it), review in Newsreader, reads with editable dates,
"Read again", and a two-step "Remove from shelf". An edition not on your shelf
offers the four shelves to add it — the path a second account, or you after a
removal, needs.

**Read rules** are `changeShelf` and `readAgain` in `lib/books/shelving.ts`, so
step 9's bulk change uses the same ones. Tightened beyond the brief's wording,
and the brief updated to say so: Finished closes the open read rather than
adding a second; Reading opens a read only if none is open; choosing the current
shelf does nothing; To read and Did not finish leave reads alone.

Remove deletes the entry (rating, review and reads with it) and keeps the
edition and work — they are catalogue, not yours. Format edits the edition row
itself, which is shared, so only someone with it shelved can change it. Every
action resolves the entry or read through the signed-in user, so a form cannot
reach another account's rows.

**Verified** by posting the page's own forms (the no-JS encoding) against the
dev database, on the Corgi paperback: rate 7, click 7 again to clear, 11
ignored; review saved and cleared by blank. Every shelf move checked against
the reads table — Finished→Finished nothing; Reading opens one; Reading again
nothing; Finished closes it today; Read again opens a reread and sets Reading;
DNF leaves it open; Finished closes it. Read dates edited, "cannot finish
before it started" and "real days" (31 February) refused, dates cleared, a read
deleted; a second account's read could be neither edited nor deleted. Format
flipped both ways. Remove took the entry and its read and kept the edition; the
page then offered the shelves and Finished added it back with a read today.
Bad or unknown ids 404. Every shelf tile now resolves.

Fixed on the way: read rows were keyed on their dates, so a save remounted the
row and its "Saved" never showed. Keyed on the read id now.

Not clicked in a browser: the remove confirmation and the review/read "Saved"
states are client state (checked via the no-JS post, not by clicking).

**Ship point.** The brief says ship after step 7. What shipping needs that is
not done: a deploy has never been tried (the GHCR workflow has not run, the
image has not been pulled on the VM), there is no README, and no Settings yet —
so no password change. The Goodreads import (step 10) is what makes it usable
with a real library.

**Next:** step 8, series.

---

## 2026-09-25 — Step 8: series

- **Work page**: a Series field (existing names offered as you type) and a
  Number; the header shows "Discworld #8" linking to the series. Series are
  shared catalogue like works. Typing a name joins the series of that name
  regardless of case, a new name creates one, a blank name takes the work out.
  A series left with no works is deleted — they only come into being through a
  work, and an empty one would keep being offered as a name. Numbers are
  `numeric(6,2)`: "8", "2.5", "#9" (the # is dropped); "eight", "1.234" and
  "-1" are refused with a message. Logic in `lib/books/series.ts`, which the
  Goodreads import reuses.
- **`/series/[slug]`**: works in order, unnumbered last, each with your shelf
  state (and the edition name when more than one is shelved), plus
  "3 books · 1 finished". That is the whole feature.
- **Shelf**: Group by series, groups by name with "Not in a series" last, and
  within a group series order wins over the chosen sort — the point is #1,
  #2, #3.

Verified by posting the work-page form: Discworld #8, "discworld" joining the
same series, Earthsea Cycle #1, a temporary series removed (and deleted with
its last work), the four bad numbers, the series page order and states, and
grouping on the shelf with `sort=title`. Not done: suggesting a series from
Open Library's own series data (it is thin, per the brief) — the Goodreads
import fills it from titles instead.

---

## 2026-09-25 — Step 9: tags and bulk selection

**Tags** (`lib/books/tags.ts`) are per account, matched by slug so "Owned",
"owned" and "  Owned  " are one tag (the first spelling is kept). A tag is
deleted when nothing carries it any more — tags exist only by being applied,
and an unused one would keep appearing in the filter and suggestions. The
edition page lists an entry's tags (each links to the shelf filtered by it, ×
removes it) with an add field offering your existing tags. The shelf has a tag
filter, listing only tags in use, with counts; `tag` is part of the view the
nav link restores but, like the shelf filter, not of the remembered
preferences.

**Bulk selection** (`app/(app)/bulk-actions.ts`), as gameshelf: a Select mode,
not a checkbox on every cover. In it, tiles (and list rows) toggle; "Select all
shown" respects the title filter; the bar moves the selection to a shelf, adds
a tag, or removes one. Moving uses `changeShelf`, so the read rules are the
edition page's. Every id posted is narrowed to your own entries first.

**Verified**: bulk actions driven through Next's action endpoint (a To-read and
a Reading entry moved to Finished — a read created for one, the open read
closed on the other; three tagged "  Owned  ", then "owned" joining the same
tag; untag two, then the last, deleting the tag; an empty selection and an
unknown id change nothing), and the edition-page tag forms plus `?tag=` on the
shelf by the no-JS post.

Worth recording, since it cost an hour: calling a server action by hand needs
the FormData argument's fields sent as `_1_<name>` **before** the root part
`0=["$undefined","$K1"]`. Next parses the body as a stream, so a root that
arrives first resolves to an empty FormData. The client does it in that order.

Not clicked in a browser: select mode, the bulk bar, and its messages.

---

## 2026-09-25 — Step 10: Settings, export, Goodreads import

**Settings** (`/settings`, now in the nav): account name and password (gameshelf's
forms and actions, copied), the Goodreads import, the list of imported books
that became local works, and export.

**Export**: `/export/json` and `/export/csv` (route handler, login required).
JSON is every entry with its edition, work, series, tags and reads; Open
Library payloads left out. CSV is one row per entry, 21 columns, reads
summarised, undated reads labelled "undated". Checked by parsing the CSV back
with the importer's parser: multi-line reviews with quotes survive.

**Goodreads import** (`lib/import/`): `csv.ts` (RFC 4180, BOM, CRLF, newlines
in quotes), `goodreads.ts` (pure mapping, unit-tested), `run.ts` (per row:
previous import by `goodreads_book_id` → ISBN here → ISBN on Open Library →
strict title+author search → local work; entry, reads, tags and series in one
transaction; covers after). The page drives batches of five
(`importGoodreadsBatch`), as gameshelf does, rather than the server-side job
proposed at the start of this step — no server state, and re-running resumes.
Brief §5 records the decisions.

**Bugs found and fixed on the way:**

- Next's 1 MB server-action body limit made any larger upload a 500 before our
  code ran — the exact bug class §5 warns about. Limit raised to 21 MB, and the
  page checks size before sending. gameshelf has the same 1 MB cap and 20 MB
  check; its Grouvee import would 500 on a big export. Not fixed there.
- "Open read" meant "no finish date", so an undated past read (from Read Count)
  would have been closed with today's date by the next move to Finished. Open
  now means started and not finished (`changeShelf`).

**A mistake of mine during testing.** I meant to run the import against a
scratch database, but the old dev server survived my `kill` and kept port
3001; the scratch server failed to bind, and the first test import went into
the dev database. It added five test works (with entries, reads, tags, two new
series, Colour of Magic into Discworld) and set a Goodreads id on the Corgi
edition. All of it was removed — rows by the Goodreads ids it had set, the two
empty series, four orphan tags, six cover files — and the dev database checked
back to its prior state (8 works, series Discworld and Earthsea Cycle, tag
Signed copy, no Goodreads ids). Every run after that checked the listening pid
and the scratch server's own request log first.

**Verified** on a scratch database (`importtest`, dropped afterwards) with a
hand-built export using Goodreads' real header and quirks: six books added —
three by ISBN, two by title, one local — each field as §5 maps it (4 stars → 8,
0 → unrated, Audible Audio → audiobook, dated read plus undated ones for Read
Count, shelves to tags, custom `did-not-finish` → dnf, `on-hold` → tbr + tag,
series from titles incl. an omnibus with no number, HTML reviews to text, dates
added kept, covers). Re-running: six "previous import", zero writes, and an
edit made in between (rating 10, reading) kept. No file, a JSON file, a
non-Goodreads CSV, a header-only file and a cut-off file: a message each. A
5.3 MB export of 5,200 rows parses. With Open Library unreachable two new rows
failed with the reason and created nothing; online again, the same file added
them. Settings lists the local work. Rename and password change checked for
each of their messages.

Not verified: the import page clicked in a browser (progress bar, Stop), an
export of a real Goodreads library — only the hand-built one — and the time a
real 800-book import takes.

**v1 build order is complete.** Owed before calling v1 done (IDEAS.md): cover
upload / URL and `/art`, editing works and editions, a README, and a first
deploy.

---

## 2026-09-25 — The owed items: covers, editing, README, deploy rehearsal

**Covers** (`lib/books/covers.ts`, `app/(app)/cover-actions.ts`,
`cover-editor.tsx`): upload, paste an address, look it up again (the manual
refresh §4a asks for; Open Library then Google, never for fan translations),
remove, and approve a flagged one. On the work and edition pages, closed until
opened. `/art` lists flagged covers on your shelf, linked from Settings with a
count. Every stored file now gets a fresh uuid name and the file it replaces is
deleted, so a changed cover is a new URL and `/covers` is back to gameshelf's
`immutable` caching. Image type is sniffed from the bytes, never trusted from a
header or filename. Verified through the actions: a real JPEG uploaded, 5 KB of
text named .jpg refused, a URL replacing it (old file deleted), an HTML page
and a dead address refused, removal deleting the file, "look it up again"
finding Open Library's cover for Guards! Guards!, the fan translation refused a
lookup but taking an upload that then showed on the shelf, `/art` listing two
flagged works and approving one.

**Editing**: work details (title, subtitle, authors, sort name, year, summary)
on the work page; edition details (name, kind, credit, language, publisher,
date, pages, length, ISBN, link, notes, base edition) on the edition page, for
editions on your shelf. Blank clears. The slug never changes. Verified: the
pen-name fix ("Cuttlefish That Loves Diving" now sorts under C on the shelf),
twelve edition validation cases, both ISBN forms stored, 11 h 5 min → 665,
fields cleared, and a kind change moving an edition in and out of the fan
translation rules. `lib/languages.ts` replaced four copies of `languageName`.

**README**: development, the runtime-data layout, the agent `next dev` gotcha,
and deployment adapted from gameshelf's for a shared VM.

**Deploy rehearsal**, locally: `docker build --target runner` (2 min, 338 MB,
`check:actions` inside the build), the workflow's smoke test (both entry points,
2 migrations bundled, uid 1001, no dev deps, argon2 resolves), then
`docker compose up -d app` with the local image on port 3002 against the dev
database: migrations and first-user step ran as no-ops, health green, signed-out
redirect to login, real sign-in, a book added with its cover written to
`../bookshelf-data/covers` as uid 1001 and served with immutable caching. Then
container, test book, cover and image removed.

**Not done**: the real first deploy. There is no GitHub remote — pushing
creates the repository's first public-facing state and triggers the GHCR build,
so it waits for a yes. Then `docker compose pull` on the VM.

---

## 2026-09-25 — First deploy, and import matching fixed against Jay's real export

**Deploy.** `iron-jay/bookshelf` is public; the first GHCR build failed because
`public/` was empty and git does not track empty directories — the local
rehearsal built from the working copy, where it existed. Fixed with
`public/.gitkeep`, and rehearsals now build from a fresh `git clone`. The image
publishes and pulls anonymously. VM steps given to Jay, including editing
`.env` without nano (the Proxmox console garbles full-screen programs).

**Real export** (410 books, parsed with no errors). Four full trial imports
into scratch databases, each behind a script that refuses to run unless the
server on 3001 is the one it just started (the lesson from step 10):

| run | ISBN | title | local | wrong | notes |
|---|---|---|---|---|---|
| 1 | 260 | 51 | 97 | ~30 "Halo" tiles, 5 novels in one work, 1 row rejected | baseline |
| 2 | 239 | 79 | 88 | 4 "already", 11 works holding 2–4 books | looser titles |
| 3 | 239 | 71 | 100 | Edge of Balance Vol. 3 + 4 merged | segment rule |
| 4 | 239 | 71 | 100 | none | tagline rule |

What changed in `lib/import/`:

- A `listened-to` exclusive shelf (and variants) is finished **as audiobook**:
  33 books, all rated, 15 labelled Hardcover by Goodreads.
- Series written as words, "(The Ember War Saga Book 34)", are parsed.
- The author cap matched between parser and batch check (an anthology credits
  51; the check allowed 50 and silently rejected the row).
- Title search tries the title without a trailing bracket, the English title in
  `[…]`, then the part before the last colon — the last as a search term only,
  never a match target.
- `sameTitle` decides matches by which side is longer and where the shorter
  stops: Open Library's may be longer (subtitle, franchise prefix); it may be
  shorter only when the rest of the Goodreads title is an "A…/An…" tagline.
  Franchise names ("Halo", "The Sandman", "Star Wars : the High Republic")
  never match a specific book.
- The same check applies to ISBN matches: an edition whose Open Library work
  disagrees keeps its edition data but gets a work of its own (115 in Jay's
  library — Halo novels, comic volumes, manga). Costs nothing visible; a wrong
  work merges books and loses one's reads.
- Imported works are titled from Goodreads (less the series bracket), so tiles
  read "Jedi Brave in Every Way", not "Star Wars".
- Settings' "added as local works" list excludes own works that have an Open
  Library edition — those matched by ISBN.

Run 4: 410 imported, no failures, one work holding two books (the same volume
from IDW and Dark Horse — legitimate), 55 series, 233 covers. The 100 local
works are mostly self-published Kindle series and Japanese/Spanish manga Open
Library does not have.

---

## 2026-09-26 — Find missing covers

Jay added a Google Books key on the VM after the Goodreads import had run, and
re-running the import would not help: every row is a previous import, and
cover lookup only runs for rows an add creates. So Settings → Cover art now has
**Find missing covers**: the manual refresh (§4a) for every book on your shelf
showing the typeset cover, in page-driven batches of five with progress and
Stop, like the import.

`findMissingCover` (lib/books/covers.ts) runs the §4a order per book — the
edition's own cover (Open Library, Google by ISBN), then the work's (Open
Library, Google by title → flagged for /art) — and re-checks first, so two
editions of one work cost one lookup. Fan translations are never counted or
looked up. Ids from the page are narrowed to your own shelf.

Verified on the dev database: two work covers removed through the real action,
five placeholders listed (fan translations excluded), then one batch: Earthsea
found on its first edition and its second skipped as already covered, Pride
and Prejudice found, the play script and the zine not found (no Open Library
cover; no Google key locally), fan translations untouched. The "to review"
outcome needs a Google key and is covered only by the Google module's tests.

Later, with Jay's Google Books key and `OPENLIBRARY_CONTACT` in the dev `.env`:
the Google path verified for real for the first time — lookups by ISBN and by
title both answer (previously only the anonymous-quota 429 and stubbed tests),
Open Library requests carry the contact in the User-Agent, and Find missing
covers on the dev shelf found the play script's cover by title (flagged, listed
on /art) and nothing for the zine.

---

## 2026-09-26 — Group by year finished

Jay asked to sort by year finished. Sort → Last finished already orders by
finish date; what was missing was the Goodreads-style "read in 2025" split, so
the shelf gains **Group by year finished**: the year of each book's latest
finish (a reread moves it to the reread's year — one group per book), newest
year first, then "Finished, date unknown" (Goodreads Read Count without a Date
Read), then "Not finished". Within a year, newest finish first, whatever the
sort — as series groups keep series order. The old "Year" grouping is renamed
"Year published". Brief §5 updated.

Verified on the dev shelf by temporarily moving test reads (2026 / 2025 / 2024
groups in order; clearing one book's dated finishes put it under "Finished,
date unknown"), then restoring them exactly. A restore loop first lost one read
— `docker compose exec` inside `while read` swallowed the rest of the input —
and was re-run with stdin from /dev/null; both reads checked against the saved
copy.

Then **Group by shelf** (To read, Reading, Finished, Did not finish, in shelf
order) and **Group by year added** (the entry's `added_at` — Goodreads' Date
Added for an import, so an imported library spreads over the years it was
built). Checked against the dev database's shelf counts (4 / 3 / 5 / 1).

---

## 2026-09-26 — Choose a cover from what the lookups find

Jay asked for gameshelf's pick-from-results cover chooser. **Change cover →
Choose from covers found** on work and edition pages shows a grid of
candidates and a free-text search; picking one and "Use this cover" applies
it (no review — a person chose it). `lib/books/cover-candidates.ts`:

- Order: this edition's cover, the work's covers, Google by ISBN, up to 16 of
  the work's other editions, Google by title. The first version capped the
  grid at 36 before Google got a look-in — Guards! Guards! has 58 editions — so
  each source now has its share.
- Search puts Google first: Open Library's search answered "halo divine wind"
  with "Mesopotamian medicine"; Google's first result was the book.
- The page sends `source` + `ref` (an Open Library cover id or a Google volume
  id); the server builds the download URL. A `ref` of `http://127.0.0.1:9/evil`
  is refused, as is an unknown source.
- Not for fan translations, in the page and in the actions — every candidate is
  an official cover (§4a).

Verified through the actions with the real Google key: 25 candidates for the
Corgi paperback in that order, search finding Halo: Divine Wind first, an Open
Library candidate applied (old file deleted), a Google one applied (review
cleared), and the four refusals. Brief §4a updated. The test cover put on the
play script was removed afterwards.
