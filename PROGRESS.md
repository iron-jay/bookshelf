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
