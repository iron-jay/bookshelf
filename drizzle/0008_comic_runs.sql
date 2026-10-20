-- A comic run's Comic Vine volume and its issue count there, so a run read
-- to the end folds into one tile on the shelf (2026-10-19). Filled when an
-- issue is added, or looked up once when the series page is opened.
ALTER TABLE "series" ADD COLUMN "comicvine_volume_id" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "issue_count" integer;