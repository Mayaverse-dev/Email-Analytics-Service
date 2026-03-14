-- Historical all-user dashboard metrics captured on every sync
CREATE TABLE IF NOT EXISTS analytics_dashboard_metric_snapshots (
    id BIGSERIAL PRIMARY KEY,
    open_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    click_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    bounce_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    unsubscribed_percentage NUMERIC(7, 4) NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_metric_snapshots_lookup
    ON analytics_dashboard_metric_snapshots (captured_at);

-- Seed one initial snapshot so the dashboard metric graphs have a starting point.
INSERT INTO analytics_dashboard_metric_snapshots
    (open_rate, click_rate, bounce_rate, unsubscribed_percentage, captured_at)
WITH ranked_contacts AS (
    SELECT
      unsubscribed,
      total_sent,
      total_delivered,
      total_opened,
      total_clicked,
      total_bounced,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(email)
        ORDER BY
          total_delivered DESC,
          total_sent DESC,
          total_opened DESC,
          total_clicked DESC,
          synced_at DESC NULLS LAST,
          id ASC
      ) AS email_rank
    FROM analytics_contacts
),
deduped_contacts AS (
    SELECT
      unsubscribed,
      total_sent,
      total_delivered,
      total_opened,
      total_clicked,
      total_bounced
    FROM ranked_contacts
    WHERE email_rank = 1
)
SELECT
  CASE
    WHEN COALESCE(SUM(total_delivered), 0) > 0
      THEN ROUND(SUM(total_opened)::numeric * 100.0 / SUM(total_delivered), 4)
    ELSE 0
  END AS open_rate,
  CASE
    WHEN COALESCE(SUM(total_delivered), 0) > 0
      THEN ROUND(SUM(total_clicked)::numeric * 100.0 / SUM(total_delivered), 4)
    ELSE 0
  END AS click_rate,
  CASE
    WHEN COALESCE(SUM(total_sent), 0) > 0
      THEN ROUND(SUM(total_bounced)::numeric * 100.0 / SUM(total_sent), 4)
    ELSE 0
  END AS bounce_rate,
  CASE
    WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE unsubscribed)::numeric * 100.0 / COUNT(*), 4)
    ELSE 0
  END AS unsubscribed_percentage,
  NOW()
FROM deduped_contacts
WHERE NOT EXISTS (
    SELECT 1
    FROM analytics_dashboard_metric_snapshots seeded
);
