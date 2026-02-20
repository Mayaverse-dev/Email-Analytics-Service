-- Add source column to track data provenance (resend, kit, etc.)
ALTER TABLE analytics_broadcasts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'resend';
ALTER TABLE analytics_contacts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'resend';
ALTER TABLE analytics_broadcast_recipients ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'resend';
ALTER TABLE analytics_segments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'resend';

-- Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_analytics_broadcasts_source ON analytics_broadcasts (source);
CREATE INDEX IF NOT EXISTS idx_analytics_contacts_source ON analytics_contacts (source);
CREATE INDEX IF NOT EXISTS idx_analytics_broadcast_recipients_source ON analytics_broadcast_recipients (source);
CREATE INDEX IF NOT EXISTS idx_analytics_segments_source ON analytics_segments (source);
