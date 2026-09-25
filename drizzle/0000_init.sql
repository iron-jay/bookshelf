CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint
CREATE TYPE "public"."art_source" AS ENUM('openlibrary', 'googlebooks', 'url', 'upload');--> statement-breakpoint
CREATE TYPE "public"."book_format" AS ENUM('book', 'audiobook');--> statement-breakpoint
CREATE TYPE "public"."edition_kind" AS ENUM('original', 'revised', 'abridged', 'annotated', 'translation', 'fanfic', 'fan_translation', 'podfic', 'fan_edit', 'other');--> statement-breakpoint
CREATE TYPE "public"."shelf_status" AS ENUM('tbr', 'reading', 'finished', 'dnf');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('openlibrary', 'local');--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"work_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "edition_kind" DEFAULT 'original' NOT NULL,
	"format" "book_format" DEFAULT 'book' NOT NULL,
	"base_edition_id" uuid,
	"language" text,
	"publisher" text,
	"published_on" date,
	"pages" integer,
	"duration_minutes" integer,
	"isbn13" text,
	"isbn10" text,
	"credit" text,
	"version_label" text,
	"url" text,
	"cover_url" text,
	"cover_source" "art_source",
	"cover_needs_review" boolean DEFAULT false NOT NULL,
	"notes" text,
	"ol_edition_key" text,
	"google_volume_id" text,
	"goodreads_book_id" bigint,
	"source" "source_kind" DEFAULT 'openlibrary' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_ol_edition_key_key" UNIQUE("ol_edition_key"),
	CONSTRAINT "editions_pages_check" CHECK ("editions"."pages" > 0),
	CONSTRAINT "editions_duration_minutes_check" CHECK ("editions"."duration_minutes" > 0),
	CONSTRAINT "editions_no_self_base" CHECK ("editions"."id" <> "editions"."base_edition_id"),
	CONSTRAINT "editions_podfic_is_audio" CHECK ("editions"."kind" <> 'podfic' OR "editions"."format" = 'audiobook')
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"status" "shelf_status" DEFAULT 'tbr' NOT NULL,
	"rating" smallint,
	"review" text,
	"review_has_spoilers" boolean DEFAULT false NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_user_id_edition_id_key" UNIQUE("user_id","edition_id"),
	CONSTRAINT "entries_rating_check" CHECK ("entries"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "entry_tags" (
	"tag_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_tags_pkey" PRIMARY KEY("tag_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"entry_id" uuid NOT NULL,
	"started_on" date,
	"finished_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reads_date_order" CHECK ("reads"."started_on" IS NULL OR "reads"."finished_on" IS NULL OR "reads"."finished_on" >= "reads"."started_on")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_user_id_slug_key" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_key" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"ol_work_key" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"sort_title" text,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"author_sort" text,
	"ol_author_keys" text[],
	"series_id" uuid,
	"series_position" numeric(6, 2),
	"derived_from_work_id" uuid,
	"summary" text,
	"first_published_year" smallint,
	"cover_url" text,
	"cover_source" "art_source",
	"cover_needs_review" boolean DEFAULT false NOT NULL,
	"ol_payload" jsonb,
	"ol_synced_at" timestamp with time zone,
	"source" "source_kind" DEFAULT 'openlibrary' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_ol_work_key_key" UNIQUE("ol_work_key"),
	CONSTRAINT "works_slug_key" UNIQUE("slug"),
	CONSTRAINT "works_no_self_derive" CHECK ("works"."id" <> "works"."derived_from_work_id"),
	CONSTRAINT "works_position_needs_series" CHECK ("works"."series_position" IS NULL OR "works"."series_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_base_edition_id_editions_id_fk" FOREIGN KEY ("base_edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_derived_from_work_id_works_id_fk" FOREIGN KEY ("derived_from_work_id") REFERENCES "public"."works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editions_work_idx" ON "editions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "editions_base_idx" ON "editions" USING btree ("base_edition_id");--> statement-breakpoint
CREATE INDEX "editions_kind_idx" ON "editions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "editions_isbn13_idx" ON "editions" USING btree ("isbn13");--> statement-breakpoint
CREATE INDEX "editions_isbn10_idx" ON "editions" USING btree ("isbn10");--> statement-breakpoint
CREATE INDEX "editions_goodreads_idx" ON "editions" USING btree ("goodreads_book_id");--> statement-breakpoint
CREATE INDEX "entries_user_status_idx" ON "entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "entries_edition_idx" ON "entries" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "reads_entry_idx" ON "reads" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "reads_finished_idx" ON "reads" USING btree ("finished_on");--> statement-breakpoint
CREATE INDEX "series_name_trgm_idx" ON "series" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "works_title_trgm_idx" ON "works" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "works_source_idx" ON "works" USING btree ("source");--> statement-breakpoint
CREATE INDEX "works_series_idx" ON "works" USING btree ("series_id","series_position");--> statement-breakpoint
CREATE INDEX "works_derived_idx" ON "works" USING btree ("derived_from_work_id");--> statement-breakpoint
CREATE INDEX "works_author_sort_idx" ON "works" USING btree ("author_sort");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER works_touch   BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER entries_touch BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
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
