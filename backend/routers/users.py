from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from cache import cache
from database import get_db

router = APIRouter()


ALLOWED_SORT_FIELDS = {"total_delivered", "open_rate", "click_rate"}
ALLOWED_SORT_ORDERS = {"asc", "desc"}


@router.get("/users")
def list_users(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
    sort: str = Query(default="total_delivered"),
    order: str = Query(default="desc"),
    segments: Optional[str] = Query(default=None),
) -> dict:
    query = q.strip().lower()
    sort_field = sort if sort in ALLOWED_SORT_FIELDS else "total_delivered"
    sort_order = order if order in ALLOWED_SORT_ORDERS else "desc"

    segment_ids: list[str] = []
    if segments:
        segment_ids = [s.strip() for s in segments.split(",") if s.strip()]

    cache_key = f"/users?limit={limit}&offset={offset}&q={query}&sort={sort_field}&order={sort_order}&segments={','.join(sorted(segment_ids))}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    order_clause = f"{sort_field} {sort_order}, email ASC"

    where_parts: list[str] = []
    params: list = []

    if query:
        where_parts.append("LOWER(email) LIKE %s")
        params.append(f"%{query}%")

    if segment_ids:
        where_parts.append(
            "EXISTS (SELECT 1 FROM contact_segment_memberships m "
            "WHERE m.contact_email = LOWER(analytics_contacts.email) "
            "AND m.segment_id = ANY(%s::uuid[]))"
        )
        params.append(segment_ids)

    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  id, email, first_name, last_name, unsubscribed,
                  total_sent, total_delivered, total_opened,
                  total_clicked, total_bounced, total_suppressed,
                  open_rate::float8 AS open_rate, click_rate::float8 AS click_rate,
                  synced_at
                FROM analytics_contacts
                {where_clause}
                ORDER BY {order_clause}
                LIMIT %s OFFSET %s
                """,
                (*params, limit, offset),
            )
            rows = cur.fetchall()

            cur.execute(
                f"SELECT COUNT(*) AS count FROM analytics_contacts {where_clause}",
                tuple(params),
            )
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
