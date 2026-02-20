-- Change analytics_contacts to allow same email with different sources
-- Drop existing unique constraint on email
ALTER TABLE analytics_contacts DROP CONSTRAINT IF EXISTS analytics_contacts_email_key;

-- Drop the existing index on email (created in 001)
DROP INDEX IF EXISTS idx_analytics_contacts_email;

-- Add composite unique constraint on (email, source) if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analytics_contacts_email_source_key'
    ) THEN
        ALTER TABLE analytics_contacts
            ADD CONSTRAINT analytics_contacts_email_source_key UNIQUE (email, source);
    END IF;
END $$;

-- Recreate index for email lookups (non-unique)
CREATE INDEX IF NOT EXISTS idx_analytics_contacts_email ON analytics_contacts (email);
