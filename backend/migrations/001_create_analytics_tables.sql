CREATE TABLE IF NOT EXISTS analytics_broadcasts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  subject TEXT,
  from_address TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  segment_id UUID,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_delivered INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_clicked INTEGER NOT NULL DEFAULT 0,
  total_bounced INTEGER NOT NULL DEFAULT 0,
  total_suppressed INTEGER NOT NULL DEFAULT 0,
  open_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  click_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_broadcast_recipients (
  id BIGSERIAL PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES analytics_broadcasts(id) ON DELETE CASCADE,
  email_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  subject TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, email_id)
);

CREATE TABLE IF NOT EXISTS analytics_contacts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
  segment_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_delivered INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_clicked INTEGER NOT NULL DEFAULT 0,
  total_bounced INTEGER NOT NULL DEFAULT 0,
  total_suppressed INTEGER NOT NULL DEFAULT 0,
  open_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  click_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_segments (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  total_broadcasts INTEGER NOT NULL DEFAULT 0,
  total_delivered INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_clicked INTEGER NOT NULL DEFAULT 0,
  open_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  click_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_sync_log (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  events_processed INTEGER NOT NULL DEFAULT 0,
  last_processed_webhook_received_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_recipients_broadcast_id
  ON analytics_broadcast_recipients (broadcast_id);

CREATE INDEX IF NOT EXISTS idx_analytics_recipients_email_address
  ON analytics_broadcast_recipients (email_address);

CREATE INDEX IF NOT EXISTS idx_analytics_recipients_last_event_at
  ON analytics_broadcast_recipients (last_event_at);

CREATE INDEX IF NOT EXISTS idx_analytics_contacts_email
  ON analytics_contacts (email);

CREATE INDEX IF NOT EXISTS idx_analytics_sync_log_started_at
  ON analytics_sync_log (started_at DESC);
