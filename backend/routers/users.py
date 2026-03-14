from __future__ import annotations

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


def _parse_uuid_query(value: Optional[str], field_name: str) -> list[str]:
    if not value:
        return []

    parsed: set[str] = set()
    for part in value.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            parsed.add(str(UUID(token)))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {field_name}") from exc
    return sorted(parsed)


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


@router.get("/users")
def list_users(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default=""),
    sort: str = Query(default="total_delivered"),
    order: str = Query(default="desc"),
    segments: Optional[str] = Query(default=None),
    include_segments: Optional[str] = Query(default=None),
    exclude_segments: Optional[str] = Query(default=None),
    include_folders: Optional[str] = Query(default=None),
    exclude_folders: Optional[str] = Query(default=None),
    root_folder_ids: Optional[str] = Query(default=None),
    parent_only: bool = Query(default=False),
) -> dict:
    query = q.strip().lower()
    sort_field = sort if sort in ALLOWED_SORT_FIELDS else "total_delivered"
    sort_order = order if order in ALLOWED_SORT_ORDERS else "desc"

    segment_ids = _parse_uuid_query(segments, "segments")
    include_segment_ids = _parse_uuid_query(include_segments, "include_segments")
    exclude_segment_ids = _parse_uuid_query(exclude_segments, "exclude_segments")
    include_folder_ids = _parse_int_query(include_folders, "include_folders")
    exclude_folder_ids = _parse_int_query(exclude_folders, "exclude_folders")
    selected_root_folder_ids = _parse_int_query(root_folder_ids, "root_folder_ids")
    formula_active = any([
        include_segment_ids,
        exclude_segment_ids,
        include_folder_ids,
        exclude_folder_ids,
    ])

    if formula_active and not (include_segment_ids or include_folder_ids):
        raise HTTPException(status_code=400, detail="Formula must include at least one segment or folder")

    cache_key = (
        f"/users?limit={limit}&offset={offset}&q={query}&sort={sort_field}&order={sort_order}"
        f"&segments={','.join(sorted(segment_ids))}"
        f"&include_segments={','.join(include_segment_ids)}"
        f"&exclude_segments={','.join(exclude_segment_ids)}"
        f"&include_folders={','.join(str(fid) for fid in include_folder_ids)}"
        f"&exclude_folders={','.join(str(fid) for fid in exclude_folder_ids)}"
        f"&root_folder_ids={','.join(str(fid) for fid in selected_root_folder_ids)}"
        f"&parent_only={str(parent_only).lower()}"
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    order_clause = f"{sort_field} {sort_order}, email ASC"
    folder_filters_cte = """
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
                folder_descendants AS (
                    SELECT
                      id AS ancestor_id,
                      id AS descendant_id
                    FROM analytics_segment_folders

                    UNION ALL

                    SELECT
                      parent.ancestor_id,
                      child.id AS descendant_id
                    FROM folder_descendants parent
                    JOIN analytics_segment_folders child ON child.parent_id = parent.descendant_id
                )
    """

    where_parts: list[str] = []
    params: list = []

    if query:
        where_parts.append("LOWER(c.email) LIKE %s")
        params.append(f"%{query}%")

    if formula_active:
        include_parts: list[str] = []
        exclude_parts: list[str] = []

        if include_segment_ids:
            include_parts.append(
                "EXISTS (SELECT 1 FROM contact_segment_memberships m "
                "WHERE m.contact_email = LOWER(c.email) "
                "AND m.segment_id = ANY(%s::uuid[]))"
            )
            params.append(include_segment_ids)

        if include_folder_ids:
            include_parts.append(
                "EXISTS ("
                "SELECT 1 "
                "FROM contact_segment_memberships m "
                "JOIN analytics_segments s ON s.id = m.segment_id "
                "JOIN folder_descendants fd_filter ON fd_filter.descendant_id = s.folder_id "
                "WHERE m.contact_email = LOWER(c.email) "
                "AND fd_filter.ancestor_id = ANY(%s::int[])"
                ")"
            )
            params.append(include_folder_ids)

        if include_parts:
            where_parts.append(f"({' OR '.join(include_parts)})")

        if exclude_segment_ids:
            exclude_parts.append(
                "EXISTS (SELECT 1 FROM contact_segment_memberships m "
                "WHERE m.contact_email = LOWER(c.email) "
                "AND m.segment_id = ANY(%s::uuid[]))"
            )
            params.append(exclude_segment_ids)

        if exclude_folder_ids:
            exclude_parts.append(
                "EXISTS ("
                "SELECT 1 "
                "FROM contact_segment_memberships m "
                "JOIN analytics_segments s ON s.id = m.segment_id "
                "JOIN folder_descendants fd_filter ON fd_filter.descendant_id = s.folder_id "
                "WHERE m.contact_email = LOWER(c.email) "
                "AND fd_filter.ancestor_id = ANY(%s::int[])"
                ")"
            )
            params.append(exclude_folder_ids)

        if exclude_parts:
            where_parts.append(f"NOT ({' OR '.join(exclude_parts)})")
    else:
        if segment_ids:
            where_parts.append(
                "EXISTS (SELECT 1 FROM contact_segment_memberships m "
                "WHERE m.contact_email = LOWER(c.email) "
                "AND m.segment_id = ANY(%s::uuid[]))"
            )
            params.append(segment_ids)

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
        elif parent_only:
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

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                {folder_filters_cte},
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
                    *params,
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
                {folder_filters_cte}
                SELECT COUNT(DISTINCT LOWER(c.email)) AS count
                FROM analytics_contacts c
                {where_clause}
                """,
                tuple(params),
            )
            total = cur.fetchone()["count"]

            cur.execute(
                f"""
                {folder_filters_cte}
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
                {folder_filters_cte},
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
