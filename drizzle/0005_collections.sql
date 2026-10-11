-- Collections above series (2026-10-11): Halo is a collection, the
-- Forerunner trilogy a series in it. A series belongs to one, and a work with
-- no series can belong to one directly. entry_cards gains the collection a
-- card belongs to (the series', else the work's own), rebuilt as in 0004 —
-- lifted verbatim from schema.sql.
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_collection_idx" ON "series" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "works_collection_idx" ON "works" USING btree ("collection_id");
--> statement-breakpoint
DROP VIEW entry_cards;
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
  -- The edition's own cover, else the work's.
  COALESCE(ed.cover_url, w.cover_url) AS cover_url,
  -- The flag belongs to whichever cover is on screen.
  CASE
    WHEN ed.cover_url IS NOT NULL THEN ed.cover_needs_review
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
  -- The series' collection, else the work's own.
  c.id                AS collection_id,
  c.name              AS collection_name,
  -- The edition's own year when it has one, so a translation groups under the
  -- year it came out rather than the year the original did.
  COALESCE(extract(year FROM ed.published_on)::int, w.first_published_year::int)
                      AS year,
  -- A reread is a new read, so the latest finish is the meaningful one.
  (SELECT max(r.finished_on) FROM reads r WHERE r.entry_id = e.id) AS last_finished_on
FROM entries e
JOIN editions ed ON ed.id = e.edition_id
JOIN works w     ON w.id = ed.work_id
LEFT JOIN series s ON s.id = w.series_id
LEFT JOIN collections c ON c.id = COALESCE(s.collection_id, w.collection_id);
