from __future__ import annotations

from cache import cache
from database import get_db

from fastapi import APIRouter

router = APIRouter()

EXCLUDED_PARENT_FOLDER_NAME = "to be tagged"
OVERALL_METRIC_DEFINITIONS = (
    ("open_rate", "Open Rate"),
    ("click_rate", "Click Rate"),
    ("bounce_rate", "Bounce Rate"),
    ("unsubscribed_percentage", "Unsubscribed Percentage"),
)


@router.get("/dashboard/parent-folders")
def get_dashboard_parent_folders() -> dict:
    cache_key = "/dashboard/parent-folders"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH RECURSIVE folder_roots AS (
                    SELECT
                      id,
                      name,
                      parent_id,
                      sort_order,
                      id AS root_id,
                      name AS root_name,
                      sort_order AS root_sort_order
                    FROM analytics_segment_folders
                    WHERE parent_id IS NULL

                    UNION ALL

                    SELECT
                      child.id,
                      child.name,
                      child.parent_id,
                      child.sort_order,
                      parent.root_id,
                      parent.root_name,
                      parent.root_sort_order
                    FROM analytics_segment_folders child
                    JOIN folder_roots parent ON child.parent_id = parent.id
                ),
                current_counts AS (
                    SELECT
                      fr.root_id,
                      fr.root_name,
                      fr.root_sort_order,
                      COUNT(DISTINCT m.contact_email) AS total_users
                    FROM contact_segment_memberships m
                    JOIN analytics_segments s ON s.id = m.segment_id
                    JOIN folder_roots fr ON fr.id = s.folder_id
                    WHERE LOWER(fr.root_name) <> %s
                    GROUP BY fr.root_id, fr.root_name, fr.root_sort_order
                )
                SELECT
                  roots.id,
                  roots.name,
                  COALESCE(current_counts.total_users, 0) AS total_users
                FROM analytics_segment_folders roots
                LEFT JOIN current_counts ON current_counts.root_id = roots.id
                WHERE roots.parent_id IS NULL
                  AND LOWER(roots.name) <> %s
                ORDER BY roots.sort_order, roots.name
                """,
                (EXCLUDED_PARENT_FOLDER_NAME, EXCLUDED_PARENT_FOLDER_NAME),
            )
            parent_folders = cur.fetchall()

            cur.execute(
                """
                SELECT
                  root_folder_id,
                  root_folder_name,
                  total_users,
                  captured_at
                FROM analytics_parent_folder_user_snapshots
                WHERE LOWER(root_folder_name) <> %s
                ORDER BY root_folder_id ASC, captured_at ASC
                """,
                (EXCLUDED_PARENT_FOLDER_NAME,),
            )
            snapshot_rows = cur.fetchall()

            cur.execute(
                """
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
                      THEN ROUND(SUM(total_opened)::numeric * 100.0 / SUM(total_delivered), 4)::float8
                    ELSE 0
                  END AS open_rate,
                  CASE
                    WHEN COALESCE(SUM(total_delivered), 0) > 0
                      THEN ROUND(SUM(total_clicked)::numeric * 100.0 / SUM(total_delivered), 4)::float8
                    ELSE 0
                  END AS click_rate,
                  CASE
                    WHEN COALESCE(SUM(total_sent), 0) > 0
                      THEN ROUND(SUM(total_bounced)::numeric * 100.0 / SUM(total_sent), 4)::float8
                    ELSE 0
                  END AS bounce_rate,
                  CASE
                    WHEN COUNT(*) > 0
                      THEN ROUND(COUNT(*) FILTER (WHERE unsubscribed)::numeric * 100.0 / COUNT(*), 4)::float8
                    ELSE 0
                  END AS unsubscribed_percentage
                FROM deduped_contacts
                """
            )
            overall_metrics = cur.fetchone()

            cur.execute(
                """
                SELECT
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate,
                  bounce_rate::float8 AS bounce_rate,
                  unsubscribed_percentage::float8 AS unsubscribed_percentage,
                  captured_at
                FROM analytics_dashboard_metric_snapshots
                ORDER BY captured_at ASC
                """
            )
            overall_metric_snapshot_rows = cur.fetchall()

    history_by_folder_id: dict[int, list[dict]] = {}
    for row in snapshot_rows:
        history_by_folder_id.setdefault(row["root_folder_id"], []).append({
            "captured_at": row["captured_at"],
            "total_users": row["total_users"],
        })

    overall_metric_cards = []
    for key, label in OVERALL_METRIC_DEFINITIONS:
        overall_metric_cards.append({
            "key": key,
            "label": label,
            "value": float(overall_metrics[key] or 0),
            "history": [
                {
                    "captured_at": row["captured_at"],
                    "value": float(row[key] or 0),
                }
                for row in overall_metric_snapshot_rows
            ],
        })

    result = {
        "parent_folders": [
            {
                "id": row["id"],
                "name": row["name"],
                "total_users": row["total_users"],
                "history": history_by_folder_id.get(row["id"], []),
            }
            for row in parent_folders
        ],
        "overall_metrics": overall_metric_cards,
    }
    cache.set(cache_key, result)
    return result
