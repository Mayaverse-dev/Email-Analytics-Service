from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache
from database import get_db

router = APIRouter()


class MoveSegmentRequest(BaseModel):
    folder_id: int | None = None


@router.get("/segment-folders")
def get_segment_folders() -> dict:
    cache_key = "/segment-folders"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, parent_id, sort_order
                FROM analytics_segment_folders
                ORDER BY sort_order, name
                """
            )
            folders = cur.fetchall()

            cur.execute(
                """
                SELECT id::text, folder_id
                FROM analytics_segments
                WHERE folder_id IS NOT NULL
                """
            )
            segment_folder_map = cur.fetchall()

    folder_to_segment_ids: dict[int, list[str]] = {}
    for row in segment_folder_map:
        fid = row["folder_id"]
        folder_to_segment_ids.setdefault(fid, []).append(row["id"])

    def collect_segment_ids(folder_id: int) -> list[str]:
        seg_ids = list(folder_to_segment_ids.get(folder_id, []))
        for f in folders:
            if f["parent_id"] == folder_id:
                seg_ids.extend(collect_segment_ids(f["id"]))
        return seg_ids

    folder_contact_counts: dict[int, int] = {}
    if segment_folder_map:
        with get_db() as conn:
            with conn.cursor() as cur:
                for f in folders:
                    seg_ids = collect_segment_ids(f["id"])
                    if not seg_ids:
                        folder_contact_counts[f["id"]] = 0
                        continue
                    cur.execute(
                        """
                        SELECT COUNT(DISTINCT contact_email) AS cnt
                        FROM contact_segment_memberships
                        WHERE segment_id = ANY(%s::uuid[])
                        """,
                        (seg_ids,),
                    )
                    folder_contact_counts[f["id"]] = cur.fetchone()["cnt"]

    def build_tree(parent_id: int | None) -> list[dict]:
        children = []
        for f in folders:
            if f["parent_id"] == parent_id:
                children.append({
                    "id": f["id"],
                    "name": f["name"],
                    "parent_id": f["parent_id"],
                    "total_contacts": folder_contact_counts.get(f["id"], 0),
                    "children": build_tree(f["id"]),
                })
        return children

    tree = build_tree(None)
    result = {"folders": tree}
    cache.set(cache_key, result)
    return result


@router.put("/segments/{segment_id}/folder")
def move_segment_to_folder(segment_id: UUID, body: MoveSegmentRequest) -> dict:
    with get_db() as conn:
        with conn.cursor() as cur:
            if body.folder_id is not None:
                cur.execute(
                    "SELECT id FROM analytics_segment_folders WHERE id = %s",
                    (body.folder_id,),
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Folder not found")

            cur.execute(
                "UPDATE analytics_segments SET folder_id = %s WHERE id = %s",
                (body.folder_id, segment_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Segment not found")
        conn.commit()

    cache.invalidate_all()
    return {"ok": True}
