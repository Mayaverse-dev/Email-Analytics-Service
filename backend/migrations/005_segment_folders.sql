-- Hierarchical folder structure for organizing segments
CREATE TABLE IF NOT EXISTS analytics_segment_folders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES analytics_segment_folders(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE analytics_segments ADD COLUMN IF NOT EXISTS folder_id INTEGER
    REFERENCES analytics_segment_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_segment_folders_parent_id
    ON analytics_segment_folders (parent_id);

CREATE INDEX IF NOT EXISTS idx_analytics_segments_folder_id
    ON analytics_segments (folder_id);
