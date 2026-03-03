-- Raw Kit data tables - populated once from Kit API, never modified after import

CREATE TABLE IF NOT EXISTS kit_broadcasts (
    id BIGINT PRIMARY KEY,
    subject TEXT,
    preview_text TEXT,
    content TEXT,
    email_address TEXT,
    created_at TIMESTAMPTZ,
    send_at TIMESTAMPTZ,
    subscriber_filter JSONB,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kit_broadcast_stats (
    broadcast_id BIGINT PRIMARY KEY REFERENCES kit_broadcasts(id) ON DELETE CASCADE,
    recipients INTEGER NOT NULL DEFAULT 0,
    open_rate FLOAT NOT NULL DEFAULT 0,
    click_rate FLOAT NOT NULL DEFAULT 0,
    emails_opened INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    unsubscribes INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kit_subscribers (
    id BIGINT PRIMARY KEY,
    email_address TEXT NOT NULL,
    first_name TEXT,
    state TEXT,
    created_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kit_subscriber_stats (
    subscriber_id BIGINT PRIMARY KEY REFERENCES kit_subscribers(id) ON DELETE CASCADE,
    sent INTEGER NOT NULL DEFAULT 0,
    opened INTEGER NOT NULL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0,
    bounced INTEGER NOT NULL DEFAULT 0,
    open_rate FLOAT NOT NULL DEFAULT 0,
    click_rate FLOAT NOT NULL DEFAULT 0,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kit_tags (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kit_tag_subscribers (
    tag_id BIGINT NOT NULL REFERENCES kit_tags(id) ON DELETE CASCADE,
    subscriber_id BIGINT NOT NULL REFERENCES kit_subscribers(id) ON DELETE CASCADE,
    tagged_at TIMESTAMPTZ,
    PRIMARY KEY (tag_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_kit_subscribers_email ON kit_subscribers (LOWER(email_address));
CREATE INDEX IF NOT EXISTS idx_kit_tag_subscribers_subscriber ON kit_tag_subscribers (subscriber_id);
