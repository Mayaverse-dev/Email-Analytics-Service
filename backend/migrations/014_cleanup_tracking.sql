-- 014: Add complained tracking and cleanup audit table

-- Track email.complained events on broadcast recipients
ALTER TABLE analytics_broadcast_recipients
    ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

-- Add total_complained to analytics_broadcasts
ALTER TABLE analytics_broadcasts
    ADD COLUMN IF NOT EXISTS total_complained INTEGER NOT NULL DEFAULT 0;

-- Add total_complained to analytics_contacts
ALTER TABLE analytics_contacts
    ADD COLUMN IF NOT EXISTS total_complained INTEGER NOT NULL DEFAULT 0;

-- Audit table for cleaned contacts
CREATE TABLE IF NOT EXISTS cleaned_contacts (
    email           TEXT NOT NULL PRIMARY KEY,
    reason          TEXT NOT NULL,
    cleaned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    segments_removed INTEGER NOT NULL DEFAULT 0,
    deleted_from_resend BOOLEAN NOT NULL DEFAULT FALSE,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_cleaned_contacts_cleaned_at
    ON cleaned_contacts (cleaned_at DESC);
