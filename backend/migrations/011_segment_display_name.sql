-- Add display_name column for UI-facing segment names.
-- name = Resend-canonical name (managed by sync)
-- display_name = user-facing name (managed by our platform)
ALTER TABLE analytics_segments ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill: set display_name = name for all existing segments
UPDATE analytics_segments SET display_name = name WHERE display_name IS NULL;

-- Make non-nullable with default
ALTER TABLE analytics_segments ALTER COLUMN display_name SET DEFAULT '';
ALTER TABLE analytics_segments ALTER COLUMN display_name SET NOT NULL;
