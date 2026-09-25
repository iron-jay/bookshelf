-- ============================================================
-- bookshelf — Postgres schema
-- Goodreads-shaped book tracker with first-class fanwork support
-- Target: PostgreSQL 16+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy title search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------

-- Where a record came from. 'openlibrary' rows are cached upstream data and
-- may be refreshed; 'local' rows are user-authored and never overwritten.
CREATE TYPE source_kind AS ENUM ('openlibrary', 'local');

-- What an edition *is*, relative to its work. The last four are community
-- releases: they get the label band and never inherit the work's cover.
CREATE TYPE edition_kind AS ENUM (
  'original',         -- a published edition of the text, any format
  'revised',          -- author's revised / expanded text
  'abridged',
  'annotated',
  'translation',      -- official, published translation
  'fanfic',           -- the posting of a fanwork (AO3, FFN, a blog)
  'fan_translation',  -- unofficial translation (light novels, web novels)
  'podfic',           -- fan-recorded audio of a text
  'fan_edit',         -- fan-cut or fan-restored text
  'other'
);

-- Read or listened to. Separate from kind: an official translation can be an
-- audiobook, and podfic always is. Deliberately two values: hardcover vs
-- paperback vs ebook is detail nobody asked to track. Open Library's own
-- physical_format stays in ol_payload if it is ever wanted.
CREATE TYPE book_format AS ENUM ('book', 'audiobook');

-- Where a cover image came from, so it can be re-fetched or left alone.
CREATE TYPE art_source AS ENUM ('openlibrary', 'googlebooks', 'url', 'upload');

-- The shelves, in the order a shelf reads in. The UI calls these shelves and
-- the free-form ones tags; gameshelf reached that naming after launch, so here
-- the schema uses it from the start.
CREATE TYPE shelf_status AS ENUM (
  -- No wishlist: tbr is "want to read", owned or not, published or not.
  'tbr',
  'reading',
  'finished',
  'dnf'         -- started and stopped, which 'finished' does not say
);

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      text NOT NULL UNIQUE,
  display_name  text,
  password_hash text NOT NULL,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(user_id);

-- ------------------------------------------------------------
-- Series — reading order. The one table added over gameshelf's shape.
-- Open Library's series data is thin, so these are mostly user-entered.
-- ------------------------------------------------------------

CREATE TABLE series (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  notes      text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX series_name_trgm_idx ON series USING gin (name gin_trgm_ops);

-- ------------------------------------------------------------
-- Works — the abstract book. "Guards! Guards!", not any one printing.
-- ------------------------------------------------------------

CREATE TABLE works (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ol_work_key           text UNIQUE,       -- "OL45804W"; NULL => local work
  slug                  text NOT NULL UNIQUE,
  title                 text NOT NULL,
  subtitle              text,
  sort_title            text,              -- "Colour of Magic, The"

  -- Names as displayed, in credit order. Not a table: grouping works off
  -- author_sort, and author pages are not in v1.
  authors               text[] NOT NULL DEFAULT '{}',
  author_sort           text,              -- "Pratchett, Terry"
  ol_author_keys        text[],

  series_id             uuid REFERENCES series(id) ON DELETE SET NULL,
  -- numeric because novellas sit between books: 2.5
  series_position       numeric(6,2),

  -- Fanfiction: a different text set in this work's world. Never an edition.
  derived_from_work_id  uuid REFERENCES works(id) ON DELETE SET NULL,

  summary               text,
  -- Open Library mostly knows a year, not a date.
  first_published_year  smallint,
  cover_url             text,
  cover_source          art_source,
  -- Set when art was auto-applied from a non-exact match. Drives /art.
  cover_needs_review    boolean NOT NULL DEFAULT false,
  -- Raw Open Library payload kept verbatim so fields can be re-derived later
  -- without another round trip. NULL for local works.
  ol_payload            jsonb,
  ol_synced_at          timestamptz,
  source                source_kind NOT NULL DEFAULT 'openlibrary',
  created_by            uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT works_no_self_derive CHECK (id <> derived_from_work_id),
  CONSTRAINT works_position_needs_series CHECK (
    series_position IS NULL OR series_id IS NOT NULL
  )
);

CREATE INDEX works_title_trgm_idx ON works USING gin (title gin_trgm_ops);
CREATE INDEX works_source_idx ON works(source);
CREATE INDEX works_series_idx ON works(series_id, series_position);
CREATE INDEX works_derived_idx ON works(derived_from_work_id);
CREATE INDEX works_author_sort_idx ON works(author_sort);

-- ------------------------------------------------------------
-- Editions — the thing you actually read or listened to.
--
-- Every work gets at least one. A fan translation is an edition whose kind is
-- 'fan_translation' and whose base_edition_id points at the text it
-- translates. Local editions hang off cached Open Library works without
-- contaminating upstream data.
-- ------------------------------------------------------------

CREATE TABLE editions (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_id            uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  -- "Paperback", "Audiobook", "Wachen! Wachen!", "AO3", "Podfic"
  name               text NOT NULL,
  kind               edition_kind NOT NULL DEFAULT 'original',
  format             book_format NOT NULL DEFAULT 'book',

  -- For derived editions: the text this translates, narrates or cuts.
  base_edition_id    uuid REFERENCES editions(id) ON DELETE SET NULL,

  language           text,                 -- ISO 639, "en", "ja"
  publisher          text,
  published_on       date,
  pages              integer CHECK (pages > 0),
  duration_minutes   integer CHECK (duration_minutes > 0),   -- audiobooks
  isbn13             text,
  isbn10             text,

  -- One free-text credit whose label the UI derives from kind and format:
  -- "Translated by" for translations, "Read by" for audiobooks and podfic,
  -- "Edited by" for fan edits. A fic's author is the work's author, not this.
  credit             text,
  version_label      text,                 -- "v2", "Chapter 1–64", "Rev. 2019"
  url                text,                 -- AO3 link, TL site, publisher page
  cover_url          text,
  cover_source       art_source,
  cover_needs_review boolean NOT NULL DEFAULT false,
  notes              text,

  ol_edition_key     text UNIQUE,          -- "OL7353617M"
  google_volume_id   text,
  -- Goodreads' own book id, so re-running an import finds what it made last time.
  goodreads_book_id  bigint,
  source             source_kind NOT NULL DEFAULT 'openlibrary',
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT editions_no_self_base CHECK (id <> base_edition_id),
  -- Podfic is fan audio by definition; a podfic marked 'book' is a data error.
  CONSTRAINT editions_podfic_is_audio CHECK (kind <> 'podfic' OR format = 'audiobook')
);

CREATE INDEX editions_work_idx ON editions(work_id);
CREATE INDEX editions_base_idx ON editions(base_edition_id);
CREATE INDEX editions_kind_idx ON editions(kind);
CREATE INDEX editions_isbn13_idx ON editions(isbn13);
CREATE INDEX editions_isbn10_idx ON editions(isbn10);
CREATE INDEX editions_goodreads_idx ON editions(goodreads_book_id);

-- ------------------------------------------------------------
-- Entries — one per (user, edition). The shelf row.
-- ------------------------------------------------------------

CREATE TABLE entries (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edition_id   uuid NOT NULL REFERENCES editions(id) ON DELETE CASCADE,

  status       shelf_status NOT NULL DEFAULT 'tbr',

  -- Out of ten, whole numbers, shown as such. No stars.
  rating       smallint CHECK (rating BETWEEN 1 AND 10),
  review       text,
  review_has_spoilers boolean NOT NULL DEFAULT false,

  is_favourite boolean NOT NULL DEFAULT false,
  is_private   boolean NOT NULL DEFAULT false,

  added_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, edition_id)
);

CREATE INDEX entries_user_status_idx ON entries(user_id, status);
CREATE INDEX entries_edition_idx ON entries(edition_id);

-- ------------------------------------------------------------
-- Reads — one pass through. Rereads are new rows, not edits.
-- No page counts or percentages: dates are the whole feature.
-- ------------------------------------------------------------

CREATE TABLE reads (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id    uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  started_on  date,
  finished_on date,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reads_date_order CHECK (
    started_on IS NULL OR finished_on IS NULL OR finished_on >= started_on
  )
);

CREATE INDEX reads_entry_idx ON reads(entry_id);
CREATE INDEX reads_finished_idx ON reads(finished_on);

-- ------------------------------------------------------------
-- Tags — free-form buckets on top of the four shelves.
-- ------------------------------------------------------------

CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  is_pinned  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, slug)
);

CREATE TABLE entry_tags (
  tag_id   uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entry_id)
);

-- ------------------------------------------------------------
-- Convenience view: a shelf row with everything needed to render a tile
-- ------------------------------------------------------------

CREATE VIEW entry_cards AS
SELECT
  e.id                AS entry_id,
  e.user_id,
  e.status,
  e.rating,
  e.is_favourite,
  e.added_at,
  e.updated_at,
  ed.id               AS edition_id,
  ed.name             AS edition_name,
  ed.kind             AS edition_kind,
  ed.format,
  ed.credit           AS edition_credit,
  ed.language,
  -- A community edition never inherits the work's cover: the official English
  -- cover on a fan translation looks correct and is wrong, which is worse than
  -- the typeset placeholder. Own art or nothing.
  CASE
    WHEN ed.kind IN ('fanfic','fan_translation','podfic','fan_edit')
      THEN ed.cover_url
    ELSE COALESCE(ed.cover_url, w.cover_url)
  END                 AS cover_url,
  -- The flag belongs to whichever cover is on screen. A placeholder needs no review.
  CASE
    WHEN ed.cover_url IS NOT NULL THEN ed.cover_needs_review
    WHEN ed.kind IN ('fanfic','fan_translation','podfic','fan_edit') THEN false
    ELSE w.cover_needs_review
  END                 AS cover_needs_review,
  w.id                AS work_id,
  w.title             AS work_title,
  w.slug              AS work_slug,
  w.authors,
  w.author_sort,
  w.series_id,
  w.series_position,
  s.name              AS series_name,
  dw.title            AS derived_from_title,
  -- The edition's own year when it has one, so a translation groups under the
  -- year it came out rather than the year the original did.
  COALESCE(extract(year FROM ed.published_on)::int, w.first_published_year::int)
                      AS year,
  (ed.kind IN ('fanfic','fan_translation','podfic','fan_edit')) AS is_community_edition,
  -- A reread is a new read, so the latest finish is the meaningful one.
  (SELECT max(r.finished_on) FROM reads r WHERE r.entry_id = e.id) AS last_finished_on
FROM entries e
JOIN editions ed ON ed.id = e.edition_id
JOIN works w     ON w.id = ed.work_id
LEFT JOIN series s ON s.id = w.series_id
LEFT JOIN works dw ON dw.id = w.derived_from_work_id;

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER works_touch   BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER entries_touch BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
