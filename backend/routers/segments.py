from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from cache import cache
from database import get_db

router = APIRouter()


class RenameSegmentRequest(BaseModel):
    display_name: str


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
                  s.id,
                  s.name,
                  s.display_name,
                  s.created_at,
                  COALESCE(c.cnt, 0) AS total_contacts,
                  s.total_broadcasts,
                  s.total_delivered,
                  s.total_opened,
                  s.total_clicked,
                  s.open_rate::float8 AS open_rate,
                  s.click_rate::float8 AS click_rate,
                  s.folder_id,
                  s.synced_at
                FROM analytics_segments s
                LEFT JOIN LATERAL (
                    SELECT COUNT(DISTINCT contact_email) AS cnt
                    FROM contact_segment_memberships
                    WHERE segment_id = s.id
                ) c ON true
                ORDER BY s.total_delivered DESC, s.name ASC
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
                  display_name,
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

            cur.execute(
                """
                SELECT
                  c.email,
                  c.first_name,
                  c.total_sent,
                  c.total_delivered,
                  c.total_opened,
                  c.total_clicked,
                  c.open_rate::float8 AS open_rate,
                  c.click_rate::float8 AS click_rate,
                  c.source
                FROM contact_segment_memberships m
                JOIN analytics_contacts c ON LOWER(c.email) = m.contact_email
                WHERE m.segment_id = %s
                ORDER BY c.email ASC
                LIMIT 500
                """,
                (segment_id,),
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


@router.put("/segments/{segment_id}/name")
def rename_segment(segment_id: UUID, body: RenameSegmentRequest) -> dict:
    if not body.display_name.strip():
        raise HTTPException(status_code=400, detail="display_name is required")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE analytics_segments SET display_name = %s WHERE id = %s",
                (body.display_name.strip(), segment_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Segment not found")
        conn.commit()

    cache.invalidate_all()
    return {"ok": True}
