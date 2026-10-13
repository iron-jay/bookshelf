-- A phone signs in once and keeps a token for months, where a browser keeps a
-- cookie. Both are rows here, stored as a digest the same way, so revoking,
-- expiry and "a password change signs everything else out" need no second
-- mechanism. `kind` keeps them apart: a cookie is never accepted as a bearer
-- token or the other way round.
--
-- The defaults describe every session that already exists, so a deploy signs
-- nobody out.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cookie';--> statement-breakpoint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_kind_check;--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_kind_check CHECK (kind IN ('cookie', 'device'));--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS label text;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
