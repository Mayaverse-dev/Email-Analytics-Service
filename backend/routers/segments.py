from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from cache import cache
from database import get_db

router = APIRouter()


@router.get("/segments")
def list_segments(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    cache_key = f"/segments?limit={limit}&offset={offset}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id,
                  name,
                  created_at,
                  total_contacts,
                  total_broadcasts,
                  total_delivered,
                  total_opened,
                  total_clicked,
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate,
                  synced_at
                FROM analytics_segments
                ORDER BY total_delivered DESC, name ASC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            rows = cur.fetchall()

            cur.execute("SELECT COUNT(*) AS count FROM analytics_segments")
            total = cur.fetchone()["count"]

    result = {"data": rows, "total": total, "limit": limit, "offset": offset}
    cache.set(cache_key, result)
    return result


@router.get("/segments/{segment_id}")
def get_segment(segment_id: UUID) -> dict:
    cache_key = f"/segments/{segment_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id,
                  name,
                  created_at,
                  total_contacts,
                  total_broadcasts,
                  total_delivered,
                  total_opened,
                  total_clicked,
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate,
                  synced_at
                FROM analytics_segments
                WHERE id = %s
                """,
                (segment_id,),
            )
            segment = cur.fetchone()
            if not segment:
                raise HTTPException(status_code=404, detail="Segment not found")

            cur.execute(
                """
                SELECT
                  id,
                  name,
                  subject,
                  status,
                  sent_at,
                  total_sent,
                  total_delivered,
                  total_opened,
                  total_clicked,
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate
                FROM analytics_broadcasts
                WHERE segment_id = %s
                ORDER BY COALESCE(sent_at, created_at) DESC NULLS LAST
                """,
                (segment_id,),
            )
            broadcasts = cur.fetchall()

            cur.execute(
                """
                SELECT
                  LOWER(r.email_address) AS email,
                  COUNT(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered,
                  COUNT(*) FILTER (WHERE r.opened_at IS NOT NULL) AS opened,
                  COUNT(*) FILTER (WHERE r.clicked_at IS NOT NULL) AS clicked
                FROM analytics_broadcast_recipients r
                JOIN analytics_broadcasts b ON b.id = r.broadcast_id
                WHERE b.segment_id = %s
                GROUP BY LOWER(r.email_address)
                ORDER BY delivered DESC, email ASC
                LIMIT 200
                """,
                (segment_id,),
            )
            users = cur.fetchall()

            segment_id_str = str(segment_id)
            cur.execute(
                """
                SELECT
                  email,
                  first_name,
                  total_sent,
                  total_delivered,
                  total_opened,
                  total_clicked,
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate,
                  source
                FROM analytics_contacts
                WHERE %s = ANY(segment_ids)
                ORDER BY email ASC
                LIMIT 500
                """,
                (segment_id_str,),
            )
            members = cur.fetchall()

    result = {
        "segment": segment,
        "broadcasts": broadcasts,
        "users": users,
        "members": members,
    }
    cache.set(cache_key, result)
    return result
