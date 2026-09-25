/**
 * Drizzle mirror of schema.sql. That file stays the readable source of truth
 * for the design; this one is what the app and drizzle-kit read.
 *
 * Objects drizzle-kit cannot express — the extensions, the touch_updated_at
 * trigger and the entry_cards view — are carried in the first migration by
 * scripts/augment-migration.py. `entryCards` below is declared `.existing()` so
 * drizzle never tries to own it.
 *
 * Unique and check constraints carry the names Postgres gives them from
 * schema.sql. Foreign keys do not: drizzle names those itself (`_fk`, not
 * `_fkey`), and a dump of a migrated database differs from schema.sql there and
 * nowhere else.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- enums

export const sourceKind = pgEnum("source_kind", ["openlibrary", "local"]);

export const editionKind = pgEnum("edition_kind", [
  "original",
  "revised",
  "abridged",
  "annotated",
  "translation",
  "fan_translation",
  "other",
]);

export const bookFormat = pgEnum("book_format", ["book", "audiobook"]);

export const artSource = pgEnum("art_source", ["openlibrary", "googlebooks", "url", "upload"]);

/** Declared in the order a shelf reads in. No wishlist: tbr is "want to read". */
export const shelfStatus = pgEnum("shelf_status", ["tbr", "reading", "finished", "dnf"]);

/**
 * Edition kinds that are community releases: they get the label band and never
 * inherit the work's cover. The entry_cards view carries the same list; keep
 * the two in step. Only fan translations since fanfic, podfic and fan edits
 * were dropped (migration 0001).
 */
export const COMMUNITY_EDITION_KINDS = ["fan_translation"] as const;

// ---------------------------------------------------------------- users

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  username: text("username").notNull().unique("users_username_key"),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// --------------------------------------------------------------- series

export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique("series_slug_key"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("series_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`)],
);

// ---------------------------------------------------------------- works

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    olWorkKey: text("ol_work_key").unique("works_ol_work_key_key"),
    slug: text("slug").notNull().unique("works_slug_key"),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    sortTitle: text("sort_title"),

    authors: text("authors").array().notNull().default(sql`'{}'`),
    authorSort: text("author_sort"),
    olAuthorKeys: text("ol_author_keys").array(),

    seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
    seriesPosition: numeric("series_position", { precision: 6, scale: 2, mode: "number" }),

    summary: text("summary"),
    firstPublishedYear: smallint("first_published_year"),
    coverUrl: text("cover_url"),
    coverSource: artSource("cover_source"),
    coverNeedsReview: boolean("cover_needs_review").notNull().default(false),
    olPayload: jsonb("ol_payload"),
    olSyncedAt: timestamp("ol_synced_at", { withTimezone: true }),
    source: sourceKind("source").notNull().default("openlibrary"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("works_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("works_source_idx").on(t.source),
    index("works_series_idx").on(t.seriesId, t.seriesPosition),
    index("works_author_sort_idx").on(t.authorSort),
    check(
      "works_position_needs_series",
      sql`${t.seriesPosition} IS NULL OR ${t.seriesId} IS NOT NULL`,
    ),
  ],
);

// ------------------------------------------------------------- editions

export const editions = pgTable(
  "editions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: editionKind("kind").notNull().default("original"),
    format: bookFormat("format").notNull().default("book"),

    baseEditionId: uuid("base_edition_id").references((): AnyPgColumn => editions.id, {
      onDelete: "set null",
    }),

    language: text("language"),
    publisher: text("publisher"),
    publishedOn: date("published_on"),
    pages: integer("pages"),
    durationMinutes: integer("duration_minutes"),
    isbn13: text("isbn13"),
    isbn10: text("isbn10"),

    credit: text("credit"),
    versionLabel: text("version_label"),
    url: text("url"),
    coverUrl: text("cover_url"),
    coverSource: artSource("cover_source"),
    coverNeedsReview: boolean("cover_needs_review").notNull().default(false),
    notes: text("notes"),

    olEditionKey: text("ol_edition_key").unique("editions_ol_edition_key_key"),
    googleVolumeId: text("google_volume_id"),
    goodreadsBookId: bigint("goodreads_book_id", { mode: "number" }),
    source: sourceKind("source").notNull().default("openlibrary"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("editions_work_idx").on(t.workId),
    index("editions_base_idx").on(t.baseEditionId),
    index("editions_kind_idx").on(t.kind),
    index("editions_isbn13_idx").on(t.isbn13),
    index("editions_isbn10_idx").on(t.isbn10),
    index("editions_goodreads_idx").on(t.goodreadsBookId),
    check("editions_pages_check", sql`${t.pages} > 0`),
    check("editions_duration_minutes_check", sql`${t.durationMinutes} > 0`),
    check("editions_no_self_base", sql`${t.id} <> ${t.baseEditionId}`),
  ],
);

// -------------------------------------------------------------- entries

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),

    status: shelfStatus("status").notNull().default("tbr"),

    rating: smallint("rating"),
    review: text("review"),
    reviewHasSpoilers: boolean("review_has_spoilers").notNull().default(false),

    isFavourite: boolean("is_favourite").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),

    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("entries_user_id_edition_id_key").on(t.userId, t.editionId),
    index("entries_user_status_idx").on(t.userId, t.status),
    index("entries_edition_idx").on(t.editionId),
    check("entries_rating_check", sql`${t.rating} BETWEEN 1 AND 10`),
  ],
);

// ---------------------------------------------------------------- reads

export const reads = pgTable(
  "reads",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    startedOn: date("started_on"),
    finishedOn: date("finished_on"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reads_entry_idx").on(t.entryId),
    index("reads_finished_idx").on(t.finishedOn),
    check(
      "reads_date_order",
      sql`${t.startedOn} IS NULL OR ${t.finishedOn} IS NULL OR ${t.finishedOn} >= ${t.startedOn}`,
    ),
  ],
);

// ----------------------------------------------------------------- tags

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tags_user_id_slug_key").on(t.userId, t.slug)],
);

export const entryTags = pgTable(
  "entry_tags",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "entry_tags_pkey", columns: [t.tagId, t.entryId] })],
);

// ----------------------------------------------------------------- view

/**
 * Everything needed to render one shelf tile. Defined in schema.sql and carried
 * in the migration; declared here only so queries against it are typed.
 */
export const entryCards = pgView("entry_cards", {
  entryId: uuid("entry_id"),
  userId: uuid("user_id"),
  status: shelfStatus("status"),
  rating: smallint("rating"),
  isFavourite: boolean("is_favourite"),
  addedAt: timestamp("added_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  editionId: uuid("edition_id"),
  editionName: text("edition_name"),
  editionKind: editionKind("edition_kind"),
  format: bookFormat("format"),
  editionCredit: text("edition_credit"),
  language: text("language"),
  /** Never the work's cover for a community edition: own art or placeholder. */
  coverUrl: text("cover_url"),
  /** Follows whichever cover is actually shown. Drives /art. */
  coverNeedsReview: boolean("cover_needs_review"),
  workId: uuid("work_id"),
  workTitle: text("work_title"),
  workSlug: text("work_slug"),
  authors: text("authors").array(),
  authorSort: text("author_sort"),
  seriesId: uuid("series_id"),
  seriesPosition: numeric("series_position", { precision: 6, scale: 2, mode: "number" }),
  seriesName: text("series_name"),
  /** The edition's own year where it has one, else the work's. */
  year: integer("year"),
  isCommunityEdition: boolean("is_community_edition"),
  /** Latest finish across all reads — a reread is a new read, not an edit. */
  lastFinishedOn: date("last_finished_on"),
}).existing();
