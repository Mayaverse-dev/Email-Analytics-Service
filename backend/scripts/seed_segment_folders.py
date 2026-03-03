#!/usr/bin/env python3
"""
Seed the segment folder structure and assign segments to folders.

Usage:
    cd backend
    python scripts/seed_segment_folders.py

Idempotent - safe to run multiple times.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations

FOLDER_TREE = {
    "To Be Tagged": {},
    "EnterMaya": {
        "Website Signups": {},
        "Ad Landing Page": {},
        "Socials": {},
        "Events": {},
    },
}

SEGMENT_ASSIGNMENTS = {
    "EnterMaya/Website Signups": [
        "Second",
        "first",
        "All",
        "10 – Downloaded: Free Chapter",
        "00 – New Signup",
        "MAYAUN",
    ],
    "EnterMaya/Ad Landing Page": [
        "MetaInstantForms",
        "Meta Infeed Form",
    ],
    "EnterMaya/Socials": [
        "55 - Manychat Instagram",
    ],
    "EnterMaya/Events": [
        "Spiel Essen Total Subscribers",
        "Worldcon - Imported August 19th, 2025 at 1:57 PM",
        "locus participants",
        "IFBE - Imported August 19th, 2025 at 6:20 PM",
    ],
}


def _upsert_folder(cur, name: str, parent_id: int | None, sort_order: int) -> int:
    if parent_id is None:
        cur.execute(
            """
            SELECT id FROM analytics_segment_folders
            WHERE name = %s AND parent_id IS NULL
            """,
            (name,),
        )
    else:
        cur.execute(
            """
            SELECT id FROM analytics_segment_folders
            WHERE name = %s AND parent_id = %s
            """,
            (name, parent_id),
        )
    row = cur.fetchone()
    if row:
        return row["id"]

    cur.execute(
        """
        INSERT INTO analytics_segment_folders (name, parent_id, sort_order)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (name, parent_id, sort_order),
    )
    return cur.fetchone()["id"]


def main() -> None:
    print("Running migrations...")
    run_migrations()
    print()

    print("Seeding folder structure...")

    folder_ids: dict[str, int] = {}

    with get_db() as conn:
        with conn.cursor() as cur:
            sort = 0
            for top_name, children in FOLDER_TREE.items():
                top_id = _upsert_folder(cur, top_name, None, sort)
                folder_ids[top_name] = top_id
                print(f"  {top_name} (id={top_id})")
                sort += 1

                child_sort = 0
                for child_name in children:
                    child_id = _upsert_folder(cur, child_name, top_id, child_sort)
                    folder_ids[f"{top_name}/{child_name}"] = child_id
                    print(f"    {child_name} (id={child_id})")
                    child_sort += 1

            print()
            print("Assigning segments to folders...")
            assigned = 0
            for folder_path, segment_names in SEGMENT_ASSIGNMENTS.items():
                fid = folder_ids.get(folder_path)
                if not fid:
                    print(f"  WARNING: Folder '{folder_path}' not found, skipping")
                    continue

                for seg_name in segment_names:
                    cur.execute(
                        """
                        UPDATE analytics_segments
                        SET folder_id = %s
                        WHERE name = %s AND (folder_id IS NULL OR folder_id != %s)
                        """,
                        (fid, seg_name, fid),
                    )
                    if cur.rowcount > 0:
                        print(f"  {seg_name} -> {folder_path}")
                        assigned += 1
                    else:
                        cur.execute(
                            "SELECT id FROM analytics_segments WHERE name = %s",
                            (seg_name,),
                        )
                        if cur.fetchone():
                            print(f"  {seg_name} -> {folder_path} (already assigned)")
                        else:
                            print(f"  WARNING: Segment '{seg_name}' not found in DB")

        conn.commit()

    print()
    print(f"Done! Assigned {assigned} segments to folders.")


if __name__ == "__main__":
    main()
