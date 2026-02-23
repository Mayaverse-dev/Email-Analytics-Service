from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from cache import cache
from database import get_db

router = APIRouter()


@router.get("/users")
def list_users(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
) -> dict:
    query = q.strip().lower()
    cache_key = f"/users?limit={limit}&offset={offset}&q={query}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            if query:
                cur.execute(
                    """
                    SELECT
                      id,
                      email,
                      first_name,
                      last_name,
                      unsubscribed,
                      segment_ids,
                      total_sent,
                      total_delivered,
                      total_opened,
                      total_clicked,
                      total_bounced,
                      total_suppressed,
                      open_rate::float8 AS open_rate,
                      click_rate::float8 AS click_rate,
                      synced_at
                    FROM analytics_contacts
                    WHERE LOWER(email) LIKE %s
                    ORDER BY total_delivered DESC, email ASC
                    LIMIT %s OFFSET %s
                    """,
                    (f"%{query}%", limit, offset),
                )
                rows = cur.fetchall()

                cur.execute(
                    "SELECT COUNT(*) AS count FROM analytics_contacts WHERE LOWER(email) LIKE %s",
                    (f"%{query}%",),
                )
                total = cur.fetchone()["count"]
            else:
                cur.execute(
                    """
                    SELECT
                      id,
                      email,
                      first_name,
                      last_name,
                      unsubscribed,
                      segment_ids,
                      total_sent,
                      total_delivered,
                      total_opened,
                      total_clicked,
                      total_bounced,
                      total_suppressed,
                      open_rate::float8 AS open_rate,
                      click_rate::float8 AS click_rate,
                      synced_at
                    FROM analytics_contacts
                    ORDER BY total_delivered DESC, email ASC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
                rows = cur.fetchall()

                cur.execute("SELECT COUNT(*) AS count FROM analytics_contacts")
                total = cur.fetchone()["count"]

    result = {"data": rows, "total": total, "limit": limit, "offset": offset}
    cache.set(cache_key, result)
    return result


@router.get("/users/{email}")
def get_user(email: str) -> dict:
    normalized_email = email.strip().lower()
    cache_key = f"/users/{normalized_email}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id,
                  email,
                  first_name,
                  last_name,
                  unsubscribed,
                  segment_ids,
                  total_sent,
                  total_delivered,
                  total_opened,
                  total_clicked,
                  total_bounced,
                  total_suppressed,
                  open_rate::float8 AS open_rate,
                  click_rate::float8 AS click_rate,
                  synced_at
                FROM analytics_contacts
                WHERE LOWER(email) = %s
                """,
                (normalized_email,),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            cur.execute(
                """
                SELECT
                  b.id AS broadcast_id,
                  b.name AS broadcast_name,
                  b.subject AS broadcast_subject,
                  b.segment_id,
                  r.email_id,
                  r.sent_at,
                  r.delivered_at,
                  r.opened_at,
                  r.clicked_at,
                  r.bounced_at,
                  r.suppressed_at,
                  r.open_count,
                  r.click_count,
                  r.last_event_at
                FROM analytics_broadcast_recipients r
                JOIN analytics_broadcasts b ON b.id = r.broadcast_id
                WHERE LOWER(r.email_address) = %s
                ORDER BY COALESCE(r.last_event_at, r.sent_at) DESC NULLS LAST
                """,
                (normalized_email,),
            )
            history = cur.fetchall()

    result = {"user": user, "history": history}
    cache.set(cache_key, result)
    return result
