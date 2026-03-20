from __future__ import annotations

import hashlib
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from cache import cache
from database import get_db

router = APIRouter()


ALLOWED_SORT_FIELDS = {"total_delivered", "open_rate", "click_rate"}
ALLOWED_SORT_ORDERS = {"asc", "desc"}
BUYER_ROOT_FOLDER_NAMES = ["kickstarter"]
BUYER_EXCLUDED_SEGMENT_NAME = "dropped backers latest"
EXCLUDED_PARENT_FOLDER_NAME = "to be tagged"

ALLOWED_SLOT_MODES = {"any", "all"}
ALLOWED_SLOT_CONNECTORS = {"union", "intersect", "exclude"}
MAX_SLOTS = 20


def _parse_int_query(value: Optional[str], field_name: str) -> list[int]:
    if not value:
        return []

    parsed: set[int] = set()
    for part in value.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            parsed.add(int(token))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {field_name}") from exc
    return sorted(parsed)


def _parse_slots(raw: Optional[str]) -> list[dict] | None:
    if not raw or not raw.strip():
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid slots JSON") from exc

    if not isinstance(data, list) or len(data) == 0:
        raise HTTPException(status_code=400, detail="slots must be a non-empty array")

    if len(data) > MAX_SLOTS:
        raise HTTPException(status_code=400, detail=f"Too many slots (max {MAX_SLOTS})")

    validated: list[dict] = []
    for index, slot in enumerate(data):
        if not isinstance(slot, dict):
            raise HTTPException(status_code=400, detail=f"Slot {index} must be an object")

        mode = slot.get("mode", "any")
        if mode not in ALLOWED_SLOT_MODES:
            raise HTTPException(status_code=400, detail=f"Slot {index}: mode must be 'any' or 'all'")

        raw_ids = slot.get("segment_ids", [])
        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            raise HTTPException(status_code=400, detail=f"Slot {index}: segment_ids must be a non-empty array")

        segment_ids: list[str] = []
        for sid in raw_ids:
            try:
                segment_ids.append(str(UUID(str(sid))))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"Slot {index}: invalid segment_id '{sid}'") from exc

        entry: dict = {"mode": mode, "segment_ids": sorted(set(segment_ids))}

        if index == 0:
            entry["connector"] = None
        else:
            connector = slot.get("connector", "union")
            if connector not in ALLOWED_SLOT_CONNECTORS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Slot {index}: connector must be 'union', 'intersect', or 'exclude'",
                )
            entry["connector"] = connector

        validated.append(entry)

    return validated


def _build_slots_cte(slots: list[dict]) -> tuple[str, list]:
    cte_parts: list[str] = []
    params: list = []

    for index, slot in enumerate(slots):
        if slot["mode"] == "any":
            cte_parts.append(
                f"slot_{index}_emails AS ("
                "SELECT DISTINCT contact_email "
                "FROM contact_segment_memberships "
                "WHERE segment_id = ANY(%s::uuid[])"
                ")"
            )
            params.append(slot["segment_ids"])
        else:
            cte_parts.append(
                f"slot_{index}_emails AS ("
                "SELECT contact_email "
                "FROM contact_segment_memberships "
                "WHERE segment_id = ANY(%s::uuid[]) "
                "GROUP BY contact_email "
                "HAVING COUNT(DISTINCT segment_id) = %s"
                ")"
            )
            params.append(slot["segment_ids"])
            params.append(len(slot["segment_ids"]))

    connector_map = {"union": "UNION", "intersect": "INTERSECT", "exclude": "EXCEPT"}

    for index in range(len(slots)):
        if index == 0:
            cte_parts.append(
                f"combined_{index} AS (SELECT contact_email FROM slot_0_emails)"
            )
        else:
            sql_op = connector_map[slots[index]["connector"]]
            cte_parts.append(
                f"combined_{index} AS ("
                f"SELECT contact_email FROM combined_{index - 1} "
                f"{sql_op} "
                f"SELECT contact_email FROM slot_{index}_emails"
                ")"
            )

    last_combined = f"combined_{len(slots) - 1}"
    return ", ".join(cte_parts), params, last_combined


@router.get("/users")
def list_users(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
    sort: str = Query(default="total_delivered"),
    order: str = Query(default="desc"),
    slots: Optional[str] = Query(default=None),
    root_folder_ids: Optional[str] = Query(default=None),
    parent_only: bool = Query(default=False),
) -> dict:
    query = q.strip().lower()
    sort_field = sort if sort in ALLOWED_SORT_FIELDS else "total_delivered"
    sort_order = order if order in ALLOWED_SORT_ORDERS else "desc"

    parsed_slots = _parse_slots(slots)
    selected_root_folder_ids = _parse_int_query(root_folder_ids, "root_folder_ids")

    slots_hash = hashlib.md5(slots.encode()).hexdigest() if slots else ""
    cache_key = (
        f"/users?limit={limit}&offset={offset}&q={query}&sort={sort_field}&order={sort_order}"
        f"&slots={slots_hash}"
        f"&root_folder_ids={','.join(str(fid) for fid in selected_root_folder_ids)}"
        f"&parent_only={str(parent_only).lower()}"
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    order_clause = f"{sort_field} {sort_order}, email ASC"

    folder_roots_cte = """
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
                )
    """

    slots_cte_sql = ""
    slots_params: list = []
    slots_combined_name = ""

    if parsed_slots:
        slots_cte_parts, slots_params, slots_combined_name = _build_slots_cte(parsed_slots)
        slots_cte_sql = ", " + slots_cte_parts

    where_parts: list[str] = []
    params: list = []

    if query:
        where_parts.append("LOWER(c.email) LIKE %s")
        params.append(f"%{query}%")

    if parsed_slots:
        where_parts.append(
            f"LOWER(c.email) IN (SELECT contact_email FROM {slots_combined_name})"
        )

    if selected_root_folder_ids:
        where_parts.append(
            "EXISTS ("
            "SELECT 1 "
            "FROM contact_segment_memberships m "
            "JOIN analytics_segments s ON s.id = m.segment_id "
            "JOIN folder_roots fr_filter ON fr_filter.id = s.folder_id "
            "WHERE m.contact_email = LOWER(c.email) "
            "AND fr_filter.root_id = ANY(%s::int[])"
            ")"
        )
        params.append(selected_root_folder_ids)
    elif parent_only and not parsed_slots:
        where_parts.append(
            "EXISTS ("
            "SELECT 1 "
            "FROM contact_segment_memberships m "
            "JOIN analytics_segments s ON s.id = m.segment_id "
            "JOIN folder_roots fr_filter ON fr_filter.id = s.folder_id "
            "WHERE m.contact_email = LOWER(c.email) "
            "AND LOWER(fr_filter.root_name) <> %s"
            ")"
        )
        params.append(EXCLUDED_PARENT_FOLDER_NAME)

    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    all_params = (*slots_params, *params)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                {folder_roots_cte}
                {slots_cte_sql},
                ranked_contacts AS (
                    SELECT
                      c.id,
                      c.email,
                      c.first_name,
                      c.last_name,
                      c.unsubscribed,
                      c.total_sent,
                      c.total_delivered,
                      c.total_opened,
                      c.total_clicked,
                      c.total_bounced,
                      c.total_suppressed,
                      c.open_rate::float8 AS open_rate,
                      c.click_rate::float8 AS click_rate,
                      c.synced_at,
                      ROW_NUMBER() OVER (
                        PARTITION BY LOWER(c.email)
                        ORDER BY
                          c.total_delivered DESC,
                          c.total_sent DESC,
                          c.total_opened DESC,
                          c.total_clicked DESC,
                          c.synced_at DESC NULLS LAST,
                          c.id ASC
                      ) AS email_rank
                    FROM analytics_contacts c
                    {where_clause}
                ),
                deduped_contacts AS (
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
                      open_rate,
                      click_rate,
                      synced_at
                    FROM ranked_contacts
                    WHERE email_rank = 1
                ),
                filtered_contacts AS (
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
                      open_rate,
                      click_rate,
                      synced_at
                    FROM deduped_contacts
                    ORDER BY {order_clause}
                    LIMIT %s OFFSET %s
                ),
                contact_membership_flags AS (
                    SELECT
                      LOWER(fc.email) AS email,
                      STRING_AGG(DISTINCT fr.root_name, ', ' ORDER BY fr.root_name) AS original_source,
                      BOOL_OR(
                        LOWER(COALESCE(fr.root_name, '')) = ANY(%s::text[])
                        AND LOWER(COALESCE(s.name, '')) <> %s
                        AND LOWER(COALESCE(s.display_name, '')) <> %s
                      ) AS buyer
                    FROM filtered_contacts fc
                    LEFT JOIN contact_segment_memberships m
                      ON m.contact_email = LOWER(fc.email)
                    LEFT JOIN analytics_segments s
                      ON s.id = m.segment_id
                    LEFT JOIN folder_roots fr
                      ON fr.id = s.folder_id
                    GROUP BY LOWER(fc.email)
                )
                SELECT
                  fc.id,
                  fc.email,
                  fc.first_name,
                  fc.last_name,
                  fc.unsubscribed,
                  fc.total_sent,
                  fc.total_delivered,
                  fc.total_opened,
                  fc.total_clicked,
                  fc.total_bounced,
                  fc.total_suppressed,
                  fc.open_rate,
                  fc.click_rate,
                  fc.synced_at,
                  cmf.original_source,
                  COALESCE(cmf.buyer, FALSE) AS buyer
                FROM filtered_contacts fc
                LEFT JOIN contact_membership_flags cmf
                  ON cmf.email = LOWER(fc.email)
                ORDER BY {order_clause}
                """,
                (
                    *all_params,
                    limit,
                    offset,
                    BUYER_ROOT_FOLDER_NAMES,
                    BUYER_EXCLUDED_SEGMENT_NAME,
                    BUYER_EXCLUDED_SEGMENT_NAME,
                ),
            )
            rows = cur.fetchall()

            cur.execute(
                f"""
                {folder_roots_cte}
                {slots_cte_sql}
                SELECT COUNT(DISTINCT LOWER(c.email)) AS count
                FROM analytics_contacts c
                {where_clause}
                """,
                tuple(all_params),
            )
            total = cur.fetchone()["count"]

            cur.execute(
                f"""
                {folder_roots_cte}
                SELECT COUNT(DISTINCT m.contact_email) AS count
                FROM contact_segment_memberships m
                JOIN analytics_segments s ON s.id = m.segment_id
                JOIN folder_roots fr ON fr.id = s.folder_id
                WHERE LOWER(fr.root_name) <> %s
                """,
                (EXCLUDED_PARENT_FOLDER_NAME,),
            )
            headline_total = cur.fetchone()["count"]

            cur.execute(
                f"""
                {folder_roots_cte},
                root_counts AS (
                    SELECT
                      fr.root_id,
                      COUNT(DISTINCT m.contact_email) AS total_users
                    FROM contact_segment_memberships m
                    JOIN analytics_segments s ON s.id = m.segment_id
                    JOIN folder_roots fr ON fr.id = s.folder_id
                    WHERE LOWER(fr.root_name) <> %s
                    GROUP BY fr.root_id
                )
                SELECT
                  roots.id,
                  roots.name,
                  COALESCE(root_counts.total_users, 0) AS total_users
                FROM analytics_segment_folders roots
                LEFT JOIN root_counts ON root_counts.root_id = roots.id
                WHERE roots.parent_id IS NULL
                  AND LOWER(roots.name) <> %s
                ORDER BY roots.sort_order, roots.name
                """,
                (EXCLUDED_PARENT_FOLDER_NAME, EXCLUDED_PARENT_FOLDER_NAME),
            )
            parent_folders = cur.fetchall()

    result = {
        "data": rows,
        "total": total,
        "headline_total": headline_total,
        "parent_folders": parent_folders,
        "limit": limit,
        "offset": offset,
    }
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
                WITH ranked_contacts AS (
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
                      synced_at,
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
                    WHERE LOWER(email) = %s
                )
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
                  open_rate,
                  click_rate,
                  synced_at
                FROM ranked_contacts
                WHERE email_rank = 1
                """,
                (normalized_email,),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            cur.execute(
                """
                SELECT
                  s.id,
                  s.name,
                  s.display_name,
                  s.folder_id,
                  m.source,
                  m.added_at
                FROM contact_segment_memberships m
                JOIN analytics_segments s ON s.id = m.segment_id
                WHERE m.contact_email = %s
                ORDER BY COALESCE(NULLIF(s.display_name, ''), s.name), s.name
                """,
                (normalized_email,),
            )
            segments = cur.fetchall()

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

    result = {"user": user, "segments": segments, "history": history}
    cache.set(cache_key, result)
    return result
