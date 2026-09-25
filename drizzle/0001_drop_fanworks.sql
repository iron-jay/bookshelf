-- Fanfic, podfic and fan edits are out of scope (2026-09-25). Fan translations
-- stay, and with them the label band and the no-inherited-cover rule.
--
-- Postgres cannot drop a value from an enum, so edition_kind is rebuilt, and
-- the view that reads it has to go first and come back last. The view is lifted
-- verbatim from schema.sql.
--
-- A database holding any of the dropped kinds stops here rather than failing
-- halfway through on a cast: those rows are someone's data, and deciding what
-- becomes of them is not a migration's call.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM editions WHERE kind::text IN ('fanfic', 'podfic', 'fan_edit'))
     OR EXISTS (SELECT 1 FROM works WHERE derived_from_work_id IS NOT NULL) THEN
    RAISE EXCEPTION 'editions of kind fanfic, podfic or fan_edit, or works with derived_from_work_id, still exist; remove or change them before migrating';
  END IF;
END
$$;
--> statement-breakpoint
DROP VIEW entry_cards;
--> statement-breakpoint
ALTER TABLE "editions" DROP CONSTRAINT "editions_podfic_is_audio";--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT "works_no_self_derive";--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT "works_derived_from_work_id_works_id_fk";
--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DEFAULT 'original'::text;--> statement-breakpoint
DROP TYPE "public"."edition_kind";--> statement-breakpoint
CREATE TYPE "public"."edition_kind" AS ENUM('original', 'revised', 'abridged', 'annotated', 'translation', 'fan_translation', 'other');--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DEFAULT 'original'::"public"."edition_kind";--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DATA TYPE "public"."edition_kind" USING "kind"::"public"."edition_kind";--> statement-breakpoint
DROP INDEX "works_derived_idx";--> statement-breakpoint
ALTER TABLE "works" DROP COLUMN "derived_from_work_id";
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
    WHEN ed.kind = 'fan_translation'
      THEN ed.cover_url
    ELSE COALESCE(ed.cover_url, w.cover_url)
  END                 AS cover_url,
  -- The flag belongs to whichever cover is on screen. A placeholder needs no review.
  CASE
    WHEN ed.cover_url IS NOT NULL THEN ed.cover_needs_review
    WHEN ed.kind = 'fan_translation' THEN false
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
  -- The edition's own year when it has one, so a translation groups under the
  -- year it came out rather than the year the original did.
  COALESCE(extract(year FROM ed.published_on)::int, w.first_published_year::int)
                      AS year,
  (ed.kind = 'fan_translation') AS is_community_edition,
  -- A reread is a new read, so the latest finish is the meaningful one.
  (SELECT max(r.finished_on) FROM reads r WHERE r.entry_id = e.id) AS last_finished_on
FROM entries e
JOIN editions ed ON ed.id = e.edition_id
JOIN works w     ON w.id = ed.work_id
LEFT JOIN series s ON s.id = w.series_id;
