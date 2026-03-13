-- Drop the legacy segment_ids array column now that
-- contact_segment_memberships junction table is the source of truth.
ALTER TABLE analytics_contacts DROP COLUMN IF EXISTS segment_ids;
