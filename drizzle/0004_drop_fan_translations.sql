-- Fan translations are out of scope (Jay, 2026-10-11), and the ones already
-- here are deleted, as he chose: the editions, and with them (by cascade)
-- their shelf entries, reads and tags. An edition that named one as its base
-- keeps going with no base (ON DELETE SET NULL).
--
-- A work left with no edition at all existed only for a fan translation (its
-- source, added through the fan translation form) and goes too: every work
-- has at least one edition. Series are left alone, even empty ones.
--
-- Their cover files stay on disk; nothing points at them any more.
--
-- Then edition_kind is rebuilt without the value, and entry_cards without the
-- community rules, as in 0001: the view first out, last back in, lifted
-- verbatim from schema.sql.
DELETE FROM editions WHERE kind = 'fan_translation';
--> statement-breakpoint
DELETE FROM works w WHERE NOT EXISTS (SELECT 1 FROM editions e WHERE e.work_id = w.id);
--> statement-breakpoint
DROP VIEW entry_cards;
--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DEFAULT 'original'::text;--> statement-breakpoint
DROP TYPE "public"."edition_kind";--> statement-breakpoint
CREATE TYPE "public"."edition_kind" AS ENUM('original', 'revised', 'abridged', 'annotated', 'translation', 'other');--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DEFAULT 'original'::"public"."edition_kind";--> statement-breakpoint
ALTER TABLE "editions" ALTER COLUMN "kind" SET DATA TYPE "public"."edition_kind" USING "kind"::"public"."edition_kind";
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
  -- The edition's own year when it has one, so a translation groups under the
  -- year it came out rather than the year the original did.
  COALESCE(extract(year FROM ed.published_on)::int, w.first_published_year::int)
                      AS year,
  -- A reread is a new read, so the latest finish is the meaningful one.
  (SELECT max(r.finished_on) FROM reads r WHERE r.entry_id = e.id) AS last_finished_on
FROM entries e
JOIN editions ed ON ed.id = e.edition_id
JOIN works w     ON w.id = ed.work_id
LEFT JOIN series s ON s.id = w.series_id;
