"""
One-time idempotent script to merge duplicate contacts (same email, different
sources) into a single row per email.

- Sums count fields (total_sent, total_delivered, etc.)
- Recomputes open_rate and click_rate from merged totals
- Picks first_name/last_name from whichever source has them
- Unions segment_ids arrays
- Keeps the row with source='resend' (or most recent) as the survivor
- Deletes the duplicate rows
- Sets source='resend' on all surviving rows

Safe to run multiple times -- if no duplicates exist, it does nothing.
The entire merge runs in a single transaction; if anything fails, all
changes are rolled back.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg
from psycopg.rows import dict_row

from config import settings


def merge_contacts() -> None:
    print("Connecting to database...")
    conn = psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=False)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT LOWER(email) AS email, COUNT(*) AS cnt
                FROM analytics_contacts
                GROUP BY LOWER(email)
                HAVING COUNT(*) > 1
                """
            )
            duplicates = cur.fetchall()

        print(f"Found {len(duplicates)} emails with duplicate entries")

        if not duplicates:
            print("Nothing to merge. Database is already clean.")
            conn.rollback()
            return

        merged_count = 0
        deleted_count = 0

        with conn.cursor() as cur:
            for dup in duplicates:
                email = dup["email"]

                cur.execute(
                    """
                    SELECT *
                    FROM analytics_contacts
                    WHERE LOWER(email) = %s
                    ORDER BY
                      CASE WHEN source = 'resend' THEN 0 ELSE 1 END,
                      synced_at DESC
                    """,
                    (email,),
                )
                rows = cur.fetchall()

                if len(rows) < 2:
                    continue

                survivor = rows[0]
                survivor_id = survivor["id"]

                total_sent = sum(r["total_sent"] or 0 for r in rows)
                total_delivered = sum(r["total_delivered"] or 0 for r in rows)
                total_opened = sum(r["total_opened"] or 0 for r in rows)
                total_clicked = sum(r["total_clicked"] or 0 for r in rows)
                total_bounced = sum(r["total_bounced"] or 0 for r in rows)
                total_suppressed = sum(r["total_suppressed"] or 0 for r in rows)

                open_rate = 0
                if total_delivered > 0:
                    open_rate = round((total_opened / total_delivered) * 100, 4)

                click_rate = 0
                if total_delivered > 0:
                    click_rate = round((total_clicked / total_delivered) * 100, 4)

                first_name = next(
                    (r["first_name"] for r in rows if r["first_name"]), None
                )
                last_name = next(
                    (r["last_name"] for r in rows if r["last_name"]), None
                )

                unsubscribed = any(r["unsubscribed"] for r in rows)

                all_segment_ids: set[str] = set()
                for r in rows:
                    if r["segment_ids"]:
                        all_segment_ids.update(r["segment_ids"])
                segment_ids = sorted(all_segment_ids)

                duplicate_ids = [r["id"] for r in rows if r["id"] != survivor_id]
                if duplicate_ids:
                    cur.execute(
                        "DELETE FROM analytics_contacts WHERE id = ANY(%s)",
                        (duplicate_ids,),
                    )
                    deleted_count += len(duplicate_ids)

                cur.execute(
                    """
                    UPDATE analytics_contacts
                    SET first_name = %s,
                        last_name = %s,
                        unsubscribed = %s,
                        segment_ids = %s,
                        total_sent = %s,
                        total_delivered = %s,
                        total_opened = %s,
                        total_clicked = %s,
                        total_bounced = %s,
                        total_suppressed = %s,
                        open_rate = %s,
                        click_rate = %s,
                        source = 'resend',
                        synced_at = NOW()
                    WHERE id = %s
                    """,
                    (
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
                        open_rate,
                        click_rate,
                        survivor_id,
                    ),
                )

                merged_count += 1
                print(f"  Merged {len(rows)} rows for {email} -> kept id={survivor_id}")

        conn.commit()
        print(f"\nDone. Merged {merged_count} emails, deleted {deleted_count} duplicate rows.")

        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS count FROM analytics_contacts")
            total = cur.fetchone()["count"]
        print(f"Total contacts after merge: {total}")

    except Exception:
        conn.rollback()
        print("\nError occurred -- all changes rolled back.")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    merge_contacts()
