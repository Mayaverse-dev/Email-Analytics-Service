-- Fix Kit table IDs to BIGINT (Kit subscriber IDs exceed INTEGER range)
ALTER TABLE kit_tag_subscribers ALTER COLUMN tag_id TYPE BIGINT;
ALTER TABLE kit_tag_subscribers ALTER COLUMN subscriber_id TYPE BIGINT;
ALTER TABLE kit_broadcast_stats ALTER COLUMN broadcast_id TYPE BIGINT;
ALTER TABLE kit_subscriber_stats ALTER COLUMN subscriber_id TYPE BIGINT;
ALTER TABLE kit_broadcasts ALTER COLUMN id TYPE BIGINT;
ALTER TABLE kit_subscribers ALTER COLUMN id TYPE BIGINT;
ALTER TABLE kit_tags ALTER COLUMN id TYPE BIGINT;
