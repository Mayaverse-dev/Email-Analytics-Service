-- Historical deduplicated user counts per top-level parent folder
CREATE TABLE IF NOT EXISTS analytics_parent_folder_user_snapshots (
    id BIGSERIAL PRIMARY KEY,
    root_folder_id INTEGER NOT NULL REFERENCES analytics_segment_folders(id) ON DELETE CASCADE,
    root_folder_name TEXT NOT NULL,
    total_users INTEGER NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_folder_user_snapshots_lookup
    ON analytics_parent_folder_user_snapshots (root_folder_id, captured_at);

-- Seed one initial snapshot so the dashboard graph has a starting point.
INSERT INTO analytics_parent_folder_user_snapshots
    (root_folder_id, root_folder_name, total_users, captured_at)
WITH RECURSIVE folder_roots AS (
    SELECT
      id,
      name,
      parent_id,
      id AS root_id,
      name AS root_name
    FROM analytics_segment_folders
    WHERE parent_id IS NULL

    UNION ALL

    SELECT
      child.id,
      child.name,
      child.parent_id,
      parent.root_id,
      parent.root_name
    FROM analytics_segment_folders child
    JOIN folder_roots parent ON child.parent_id = parent.id
)
SELECT
  fr.root_id,
  fr.root_name,
  COUNT(DISTINCT m.contact_email) AS total_users,
  NOW()
FROM contact_segment_memberships m
JOIN analytics_segments s ON s.id = m.segment_id
JOIN folder_roots fr ON fr.id = s.folder_id
WHERE LOWER(fr.root_name) <> 'to be tagged'
  AND NOT EXISTS (
      SELECT 1
      FROM analytics_parent_folder_user_snapshots seeded
  )
GROUP BY fr.root_id, fr.root_name;
