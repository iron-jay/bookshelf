-- Comics and graphic novels from Comic Vine (2026-10-11): a work added from
-- there is neither Open Library's nor typed in by hand, so it gets its own
-- source; its cover its own art source; and the issue it came from, so adding
-- it twice finds the first.
ALTER TYPE "public"."art_source" ADD VALUE 'comicvine';--> statement-breakpoint
ALTER TYPE "public"."source_kind" ADD VALUE 'comicvine';--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "comicvine_issue_id" integer;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_comicvine_issue_id_key" UNIQUE("comicvine_issue_id");