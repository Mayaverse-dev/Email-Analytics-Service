-- Time series snapshot tables, appended on every sync

CREATE TABLE IF NOT EXISTS analytics_broadcast_snapshots (
    id BIGSERIAL PRIMARY KEY,
    broadcast_id UUID NOT NULL REFERENCES analytics_broadcasts(id) ON DELETE CASCADE,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_delivered INTEGER NOT NULL DEFAULT 0,
    total_opened INTEGER NOT NULL DEFAULT 0,
    total_clicked INTEGER NOT NULL DEFAULT 0,
    open_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    click_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_segment_snapshots (
    id BIGSERIAL PRIMARY KEY,
    segment_id UUID NOT NULL REFERENCES analytics_segments(id) ON DELETE CASCADE,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_snapshots_lookup
    ON analytics_broadcast_snapshots (broadcast_id, captured_at);

CREATE INDEX IF NOT EXISTS idx_segment_snapshots_lookup
    ON analytics_segment_snapshots (segment_id, captured_at);
