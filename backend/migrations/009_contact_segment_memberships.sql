-- Junction table: single source of truth for contact-segment membership
CREATE TABLE IF NOT EXISTS contact_segment_memberships (
    contact_email TEXT NOT NULL,
    segment_id UUID NOT NULL,
    source TEXT NOT NULL DEFAULT 'import',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_to_resend BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (contact_email, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_csm_segment_id
    ON contact_segment_memberships (segment_id);

CREATE INDEX IF NOT EXISTS idx_csm_unsynced
    ON contact_segment_memberships (synced_to_resend)
    WHERE NOT synced_to_resend;

CREATE INDEX IF NOT EXISTS idx_csm_contact_email
    ON contact_segment_memberships (contact_email);
