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
