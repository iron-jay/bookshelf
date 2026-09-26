-- Hardcover as an optional source (2026-09-26): its covers need their own
-- art_source value rather than masquerading as 'url', and a local work records
-- which Hardcover book filled it in, so a fill-in run never repeats itself.
ALTER TYPE "public"."art_source" ADD VALUE 'hardcover';--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "hardcover_id" integer;