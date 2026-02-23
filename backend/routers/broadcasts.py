from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from cache import cache
from database import get_db

router = APIRouter()


@router.get("/broadcasts")
def list_broadcasts(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
) -> dict:
    query = q.strip().lower()
    cache_key = f"/broadcasts?limit={limit}&offset={offset}&q={query}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            if query:
                cur.execute(
                    """
                    SELECT
                      id, name, subject, from_address, status, segment_id,
                      created_at, sent_at, total_sent, total_delivered,
                      total_opened, total_clicked, total_bounced, total_suppressed,
                      open_rate::float8 AS open_rate, click_rate::float8 AS click_rate,
                      synced_at
                    FROM analytics_broadcasts
                    WHERE LOWER(name) LIKE %s OR LOWER(subject) LIKE %s
                    ORDER BY COALESCE(sent_at, created_at) DESC NULLS LAST
                    LIMIT %s OFFSET %s
                    """,
                    (f"%{query}%", f"%{query}%", limit, offset),
                )
                rows = cur.fetchall()

                cur.execute(
                    """
                    SELECT COUNT(*) AS count FROM analytics_broadcasts
                    WHERE LOWER(name) LIKE %s OR LOWER(subject) LIKE %s
                    """,
                    (f"%{query}%", f"%{query}%"),
                )
                total = cur.fetchone()["count"]
            else:
                cur.execute(
                    """
                    SELECT
                      id, name, subject, from_address, status, segment_id,
                      created_at, sent_at, total_sent, total_delivered,
                      total_opened, total_clicked, total_bounced, total_suppressed,
                      open_rate::float8 AS open_rate, click_rate::float8 AS click_rate,
                      synced_at
                    FROM analytics_broadcasts
                    ORDER BY COALESCE(sent_at, created_at) DESC NULLS LAST
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
                rows = cur.fetchall()

                cur.execute("SELECT COUNT(*) AS count FROM analytics_broadcasts")
                total = cur.fetchone()["count"]

    result = {"data": rows, "total": total, "limit": limit, "offset": offset}
    cache.set(cache_key, result)
    return result


@router.get("/broadcasts/{broadcast_id}")
def get_broadcast(broadcast_id: UUID) -> dict:
    cache_key = f"/broadcasts/{broadcast_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id, name, subject, from_address, status, segment_id,
                  created_at, sent_at, total_sent, total_delivered,
                  total_opened, total_clicked, total_bounced, total_suppressed,
                  open_rate::float8 AS open_rate, click_rate::float8 AS click_rate,
                  html_content, text_content, preview_text, reply_to, synced_at
                FROM analytics_broadcasts
                WHERE id = %s
                """,
                (broadcast_id,),
            )
            broadcast = cur.fetchone()
            if not broadcast:
                raise HTTPException(status_code=404, detail="Broadcast not found")

            cur.execute(
                """
                SELECT
                  COUNT(*) AS total_recipients,
                  COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered_recipients,
                  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened_recipients,
                  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked_recipients
                FROM analytics_broadcast_recipients
                WHERE broadcast_id = %s
                """,
                (broadcast_id,),
            )
            summary = cur.fetchone()

    result = {"broadcast": broadcast, "summary": summary}
    cache.set(cache_key, result)
    return result


@router.get("/broadcasts/{broadcast_id}/recipients")
def get_broadcast_recipients(
    broadcast_id: UUID,
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
) -> dict:
    query = q.strip().lower()
    cache_key = f"/broadcasts/{broadcast_id}/recipients?limit={limit}&offset={offset}&q={query}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            if query:
                cur.execute(
                    """
                    SELECT
                      id, broadcast_id, email_id, email_address, subject,
                      sent_at, delivered_at, opened_at, clicked_at,
                      bounced_at, suppressed_at, open_count, click_count, last_event_at
                    FROM analytics_broadcast_recipients
                    WHERE broadcast_id = %s AND LOWER(email_address) LIKE %s
                    ORDER BY COALESCE(last_event_at, sent_at) DESC NULLS LAST
                    LIMIT %s OFFSET %s
                    """,
                    (broadcast_id, f"%{query}%", limit, offset),
                )
                rows = cur.fetchall()

                cur.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM analytics_broadcast_recipients
                    WHERE broadcast_id = %s AND LOWER(email_address) LIKE %s
                    """,
                    (broadcast_id, f"%{query}%"),
                )
                total = cur.fetchone()["count"]
            else:
                cur.execute(
                    """
                    SELECT
                      id, broadcast_id, email_id, email_address, subject,
                      sent_at, delivered_at, opened_at, clicked_at,
                      bounced_at, suppressed_at, open_count, click_count, last_event_at
                    FROM analytics_broadcast_recipients
                    WHERE broadcast_id = %s
                    ORDER BY COALESCE(last_event_at, sent_at) DESC NULLS LAST
                    LIMIT %s OFFSET %s
                    """,
                    (broadcast_id, limit, offset),
                )
                rows = cur.fetchall()

                cur.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM analytics_broadcast_recipients
                    WHERE broadcast_id = %s
                    """,
                    (broadcast_id,),
                )
                total = cur.fetchone()["count"]

    result = {"data": rows, "total": total, "limit": limit, "offset": offset}
    cache.set(cache_key, result)
    return result
