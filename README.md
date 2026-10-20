# bookshelf

Self-hosted book tracker: Goodreads' interaction model and Open Library's
catalogue. Sibling of
[gameshelf](https://github.com/iron-jay/gameshelf) — same stack, same
deployment shape.

See `CLAUDE.md` for the project brief, `schema.sql` for the data model and
`PROGRESS.md` for the dev log.

## Development

Runs in WSL2 (Ubuntu 24.04) with the repo on the Linux filesystem, not
`/mnt/c/`, beside gameshelf. Ports sit one above gameshelf's so both run at
once: app 3001, Postgres 5433.

```bash
cp .env.example .env      # fill in; COVERS_DIR must be absolute
docker compose up -d db   # Postgres only; the app runs on the host
npm install
npm run db:migrate        # builds the schema, view and trigger included
npm run db:seed           # first user from .env, if there is nobody yet
npm run dev -- -p 3001    # http://localhost:3001
```

Compose checks every required variable in the file, not only the started
service's, so even `up -d db` needs `SESSION_SECRET` and `ADMIN_PASSWORD` set.

Build `db:migrate`, never `db:push`, for a fresh database: push cannot create
the extensions, the `touch_updated_at` trigger or the `entry_cards` view.

### Runtime data lives outside the repository

```
code/
├── bookshelf/          the repository
└── bookshelf-data/
    ├── pgdata/         Postgres
    └── covers/         cover art (the container's; dev uses ./data/covers)
```

`COVERS_DIR` must be an absolute path: a relative one makes the bundler trace
the whole project into the server build.

| Script | Does |
|---|---|
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Create the first user from `.env`; nothing once anyone exists |
| `npm run check:actions` | Fail if a `"use server"` file exports anything but async functions |
| `npm run typecheck` | `tsc --noEmit` |

`schema.sql` is the readable source of truth; `lib/db/schema.ts` mirrors it by
hand. After generating the migration that first creates schema objects, run
`python3 scripts/augment-migration.py drizzle/<file>.sql` to add what
drizzle-kit cannot express. Later changes to the view or trigger go into their
migration by hand (see `drizzle/0001_drop_fanworks.sql`).

### Running `next dev` from an AI coding agent

Next 16 appends a block of instructions to `CLAUDE.md` when `next dev` detects
an agent in the environment. Start it with the detection variables unset:

```bash
env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_IS_COWORK npm run dev -- -p 3001
```

### JSON API

The companion phone app talks to `/api/v1`, the same contract as gameshelf's.
It signs in once and keeps a device token, sent as
`Authorization: Bearer <token>`; covers and the export accept the same token,
so it also works for scripts:

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"…","deviceName":"curl"}'
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/me
```

| Route | |
|---|---|
| `GET /api/v1/meta` | App name, shelves, whether sign-in is required. No token needed. |
| `POST /api/v1/auth/token` | Username and password in, `{ token, user }` out |
| `DELETE /api/v1/auth/token` | Signs the calling device out |
| `GET /api/v1/me` | The signed-in user |
| `GET /api/v1/shelf` | Shelf cards. `shelf`, `tag` (slug), `sort` (`added`, `title`, `author`, `rated`, `finished`), `limit` (1–500, default 100), `offset`, and `runs=fold` to stack each comic run read to the end into one card (its `run` is `{ seriesSlug, issueCount }`; every other card's is null; not with `tag`). Returns `{ total, limit, offset, items }` |
| `GET /api/v1/tags` | Your tags with how many entries carry each |
| `GET /api/v1/search?q=` | This server, Open Library and Hardcover merged as on the search page; an ISBN answers with the one edition (`isbn.remote` carries `olWorkKey`, `olEditionKey`, `format` and `isbn`, ready for `POST /entries`). `catalogueError` says why remote results are missing |
| `GET /api/v1/works/{slug}` | A work, its editions (with your entry on each), series and collection |
| `GET /api/v1/editions/{id}` | An edition, its work, and your entry id if shelved |
| `GET /api/v1/catalogue/openlibrary/{olWorkKey}` | An Open Library work and its editions (newest first, each with `format`, language, ISBN, and your `editionId` if shelved), to pick one before adding |
| `GET /api/v1/catalogue/comics?q=` | Comic Vine volumes. Needs `COMICVINE_API_KEY`; credit Comic Vine wherever these are shown |
| `GET /api/v1/catalogue/comics/{volumeId}` | A volume's issues, each with the title it will have on the shelf |
| `POST /api/v1/entries` | One of `{ editionId }`; `{ olWorkKey, olEditionKey?, format?, credit?, durationMinutes?, isbn? }` (no `olEditionKey` is "any edition"); `{ hardcoverId, format? }`; `{ comicvineIssueId }`. Each takes `shelf?` (default `tbr`); `format` is `book` (default) or `audiobook`. 201 when added, 200 when it was already there (its shelf is kept). Reading opens a read, Finished records one, on `finishedOn?` (`YYYY-MM-DD`, default today) |
| `GET /api/v1/series/{slug}` | A series: its works in reading order, your entries on each, and its collection |
| `POST /api/v1/series/{slug}/read` | The whole series read: `{ finishedOn? }` (default today). Every book not yet finished goes to Finished on that day; one not on your shelf goes on it. Returns `{ finished, alreadyFinished, series }` |
| `GET /api/v1/entries/{id}` | One entry: its card plus review, flags, tags and reads |
| `PATCH /api/v1/entries/{id}` | Any of `shelf`, `rating` (1–10 or null), `review`, `reviewHasSpoilers`, `isFavourite`, `isPrivate`. A shelf change follows the read rules |
| `DELETE /api/v1/entries/{id}` | Takes it off your shelf with its rating, review, reads and tags. The book stays on the server |
| `POST /api/v1/entries/{id}/reads` | Read again: a new read started today, back on Reading |
| `PATCH /api/v1/reads/{id}` | `startedOn`, `finishedOn` (`YYYY-MM-DD` or null) |
| `DELETE /api/v1/reads/{id}` | Removes one read |
| `PUT /api/v1/entries/{id}/tags/{name}` | Adds a tag, creating it if new. Returns `{ tags }` |
| `DELETE /api/v1/entries/{id}/tags/{name}` | Removes a tag; one left on nothing is deleted. Returns `{ tags }` |

Errors are `{ "error": { "code", "message" } }` with a matching status; a
missing or expired token is a 401. Device tokens last 180 days from last use
and are listed in Settings, where each can be signed out. Changing your
password signs every device out. Ten failed sign-ins for one username or from
one address in fifteen minutes block further attempts, on the web form too.

With `AUTH_DISABLED=true` the API needs no token either, the same as the web.

## Deployment

Same shape as gameshelf, and it can share gameshelf's Debian VM: its own
Postgres container, its own `../bookshelf-data`, app on 3001. The steps below
were rehearsed on 2026-09-25 with a locally built image — migrations applied,
the first-user step, sign-in, adding a book and its cover written as uid 1001 —
but **not yet from GHCR on the VM**.

### First run

On the VM, beside gameshelf:

```bash
git clone https://github.com/iron-jay/bookshelf.git /srv/bookshelf
cd /srv/bookshelf
mkdir -p ../bookshelf-data/pgdata ../bookshelf-data/covers
# The app runs as uid 1001 and a bind mount keeps the host's ownership, so
# without this the first cover download fails. No sudo? Let Docker do it:
#   docker run --rm -v "$(realpath ../bookshelf-data/covers)":/c alpine chown 1001:1001 /c
sudo chown -R 1001:1001 ../bookshelf-data/covers
cp .env.example .env      # fill in; see below
docker compose pull
docker compose up -d
```

In `.env` for production:

- `POSTGRES_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 32`),
  `ADMIN_PASSWORD` — required.
- `ORIGIN` — the public `https://` URL. The session cookie's `Secure` flag is
  derived from it.
- `OPENLIBRARY_CONTACT` — an email or URL, sent in the User-Agent as Open
  Library asks. Without it the repository URL stands in.
- `GOOGLE_BOOKS_API_KEY` — optional, but without it the cover fallback finds
  nothing: the anonymous quota is shared with everyone and usually spent.
- `HARDCOVER_API_TOKEN` — optional. A personal access token from
  hardcover.app → Settings → Hardcover API. Fills in books Open Library does
  not have (description, year, series, cover) on import and from Settings,
  and is searched beside Open Library when adding a book.
- `COMICVINE_API_KEY` — optional. A free key from a Comic Vine account
  (comicvine.gamespot.com/api), for "Add comic or graphic novel".
  Non-commercial use only.
- `COVERS_DIR` is set by the compose file; leave it out.

The container applies migrations and creates the first user before serving
(`migrate.mjs`, then `server.js`); both are no-ops when there is nothing to do,
and the server does not start if the schema cannot be brought up to date.

### Images

Every push to `main` builds an image in GitHub Actions and publishes it to
`ghcr.io/iron-jay/bookshelf` (`latest` and the commit sha). The workflow then
pulls it and checks it starts, that the migrate bundle resolves, and that no dev
dependencies leaked in. The VM only pulls.

To build by hand:

```bash
docker build --target runner -t ghcr.io/iron-jay/bookshelf:latest .
```

Pin a build with `BOOKSHELF_TAG=<sha>` in `.env`. If the package is private,
the VM needs `docker login ghcr.io` with a classic token carrying
`read:packages`, as gameshelf documents.

### The account

The first start creates `ADMIN_USERNAME` (default `admin`) with
`ADMIN_PASSWORD`, only when the database has no user at all. After that the
name and password are changed in **Settings**, and those variables are ignored.

`AUTH_DISABLED=true` skips sign-in for everything — reading, editing, deleting,
covers and export — which is right on a private network and wrong anywhere a
port forward or tunnel could reach.

### Reverse proxy

The app listens on plain HTTP on `127.0.0.1:3001`. Forward the original `Host`
(server actions compare `Origin` against it — every form in the app is one),
and set `ORIGIN` to the public URL.

```
books.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

### Updating

```bash
git pull                  # when docker-compose.yml or .env.example changed
docker compose pull
docker compose up -d
```

### Deploying on push

The workflow's `deploy` job rolls each new image out on the VM by itself,
through a GitHub Actions runner installed there. The runner dials out to
GitHub, so nothing on the VM has to be reachable from outside. The job is off
until the repository variable `DEPLOY_DIR` is set, and it runs only for `main`.

Once, on the VM, as the user that already runs `docker compose` (it needs the
`docker` group and read access to `.env`):

1. In this repository on GitHub: **Settings → Actions → Runners → New
   self-hosted runner**, Linux, x64. Run its *Download* commands in a new
   directory, `~/actions-runner-bookshelf`. A runner belongs to one repository on
   a personal account, so gameshelf gets its own beside it.
2. Register it with the token that page shows:

   ```bash
   ./config.sh --url https://github.com/iron-jay/bookshelf --token <token> \
     --name bookshelf-vm --labels shelf-vm --unattended
   ```

3. Run it as a service, so it survives reboots, as that same user:

   ```bash
   sudo ./svc.sh install "$USER"
   sudo ./svc.sh start
   ```

4. **Settings → Secrets and variables → Actions → Variables**: add
   `DEPLOY_DIR` = `/srv/bookshelf` (the directory holding `.env`).

To try it, run **Publish images** by hand from the Actions tab on `main`.

The job uses the compose file from the commit being deployed, with
`--project-directory $DEPLOY_DIR`, so `.env`, the project name and
`../bookshelf-data` stay where they are and the clone on the VM needs no
`git pull`. It pulls the app, runs `docker compose up -d`, prunes old images,
and fails unless `/api/v1/meta` answers within three minutes; migrations run
before that answer, so a failed migration fails the job. A `BOOKSHELF_TAG`
pin in `.env` still holds. To stop deploying, delete `DEPLOY_DIR`.

### Backups

Both bind mounts sit under `../bookshelf-data`, so a VM backup covers them.
Nightly dump alongside gameshelf's:

```cron
10 3 * * * cd /srv/bookshelf && docker compose exec -T db pg_dump -U bookshelf bookshelf | gzip > ../bookshelf-data/dump-$(date +\%F).sql.gz
```

### Ports and logs

Both services bind to `127.0.0.1` by default; override with `APP_BIND`,
`APP_PORT`, `DB_BIND`, `DB_PORT`. Container logs are capped at 3 × 10 MB — a
crash loop filled gameshelf's disk once.

### Disk

If bookshelf gets its own VM rather than gameshelf's: the Debian cloud image's
root partition is about 3 GB whatever the Proxmox disk says. Check `df -h /`
and grow it (`growpart /dev/sda 1 && resize2fs /dev/sda1`) before the first
`docker compose up`.

## Importing from Goodreads

Settings → Import from Goodreads, with the CSV from Goodreads' *Export
Library*. Books match by ISBN, then by title and author; the rest are added as
local works and listed for fixing. Keep the tab open while it runs (about two
seconds per new book); running the same file again resumes and never
overwrites anything you have changed.
