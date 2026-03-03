#!/usr/bin/env python3
"""
One-time script to fetch all Kit API data into raw kit_* tables.

Usage:
    cd backend
    python scripts/import_kit_raw.py          # Resume mode
    python scripts/import_kit_raw.py --fresh  # Re-fetch everything

Idempotent - uses ON CONFLICT DO UPDATE on all inserts.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations
from services.kit_client import KitClient

BATCH_SIZE = 100


def _parse_ts(value: Any) -> str | None:
    if not value:
        return None
    return str(value).replace("Z", "+00:00") if isinstance(value, str) else None


def _get_existing_subscriber_ids() -> set[int]:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM kit_subscribers")
            return {row["id"] for row in cur.fetchall()}


def import_broadcasts(client: KitClient) -> int:
    print("Fetching broadcasts from Kit API...")
    broadcasts = client.list_broadcasts()
    print(f"  Found {len(broadcasts)} broadcasts")

    print("Fetching individual broadcast details + stats...")
    for i, b in enumerate(broadcasts):
        bid = b.get("id")
        if not bid:
            continue

        try:
            detail = client.get_broadcast(bid)
        except Exception as e:
            print(f"  WARNING: Failed to fetch broadcast {bid}: {e}")
            detail = b

        try:
            stats = client.get_broadcast_stats(bid)
        except Exception as e:
            print(f"  WARNING: Failed to fetch stats for broadcast {bid}: {e}")
            stats = {}

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO kit_broadcasts (id, subject, preview_text, content, email_address,
                        created_at, send_at, subscriber_filter, imported_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        subject = EXCLUDED.subject,
                        preview_text = EXCLUDED.preview_text,
                        content = EXCLUDED.content,
                        email_address = EXCLUDED.email_address,
                        created_at = EXCLUDED.created_at,
                        send_at = EXCLUDED.send_at,
                        subscriber_filter = EXCLUDED.subscriber_filter,
                        imported_at = NOW()
                    """,
                    (
                        bid,
                        detail.get("subject"),
                        detail.get("preview_text"),
                        detail.get("content"),
                        detail.get("email_address"),
                        _parse_ts(detail.get("created_at")),
                        _parse_ts(detail.get("send_at")),
                        json.dumps(detail.get("subscriber_filter")) if detail.get("subscriber_filter") else None,
                    ),
                )

                if stats:
                    cur.execute(
                        """
                        INSERT INTO kit_broadcast_stats (broadcast_id, recipients, open_rate, click_rate,
                            emails_opened, total_clicks, unsubscribes, status, imported_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (broadcast_id) DO UPDATE SET
                            recipients = EXCLUDED.recipients,
                            open_rate = EXCLUDED.open_rate,
                            click_rate = EXCLUDED.click_rate,
                            emails_opened = EXCLUDED.emails_opened,
                            total_clicks = EXCLUDED.total_clicks,
                            unsubscribes = EXCLUDED.unsubscribes,
                            status = EXCLUDED.status,
                            imported_at = NOW()
                        """,
                        (
                            bid,
                            int(stats.get("recipients") or 0),
                            float(stats.get("open_rate") or 0),
                            float(stats.get("click_rate") or 0),
                            int(stats.get("emails_opened") or 0),
                            int(stats.get("total_clicks") or 0),
                            int(stats.get("unsubscribes") or 0),
                            stats.get("status"),
                        ),
                    )
            conn.commit()

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(broadcasts)} broadcasts")

    print(f"  Imported {len(broadcasts)} broadcasts")
    return len(broadcasts)


def import_subscribers(client: KitClient, resume: bool) -> int:
    existing_ids = _get_existing_subscriber_ids() if resume else set()
    if existing_ids:
        print(f"Resume mode: {len(existing_ids)} subscribers already in DB")

    print("Fetching subscribers from Kit API...")
    subscribers = client.list_subscribers(status="all")
    print(f"  Found {len(subscribers)} subscribers")

    print("Importing subscribers + fetching stats...")
    imported = 0
    skipped = 0
    batch: list[tuple[dict, dict]] = []

    for i, s in enumerate(subscribers):
        sid = s.get("id")
        if not sid:
            continue

        if resume and sid in existing_ids:
            skipped += 1
            if (i + 1) % 200 == 0:
                print(f"  Processed {i + 1}/{len(subscribers)} (imported: {imported}, skipped: {skipped})")
            continue

        stats = client.get_subscriber_stats(sid)
        batch.append((s, stats))

        if len(batch) >= BATCH_SIZE:
            _write_subscriber_batch(batch)
            imported += len(batch)
            batch = []

        if (i + 1) % 200 == 0:
            print(f"  Processed {i + 1}/{len(subscribers)} (imported: {imported}, skipped: {skipped})")

    if batch:
        _write_subscriber_batch(batch)
        imported += len(batch)

    print(f"  Imported {imported} subscribers, skipped {skipped}")
    return imported


def _write_subscriber_batch(batch: list[tuple[dict, dict]]) -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            for s, stats in batch:
                cur.execute(
                    """
                    INSERT INTO kit_subscribers (id, email_address, first_name, state, created_at, imported_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        email_address = EXCLUDED.email_address,
                        first_name = EXCLUDED.first_name,
                        state = EXCLUDED.state,
                        created_at = EXCLUDED.created_at,
                        imported_at = NOW()
                    """,
                    (
                        s["id"],
                        s.get("email_address"),
                        s.get("first_name"),
                        s.get("state"),
                        _parse_ts(s.get("created_at")),
                    ),
                )

                if stats:
                    cur.execute(
                        """
                        INSERT INTO kit_subscriber_stats (subscriber_id, sent, opened, clicked, bounced,
                            open_rate, click_rate, imported_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (subscriber_id) DO UPDATE SET
                            sent = EXCLUDED.sent,
                            opened = EXCLUDED.opened,
                            clicked = EXCLUDED.clicked,
                            bounced = EXCLUDED.bounced,
                            open_rate = EXCLUDED.open_rate,
                            click_rate = EXCLUDED.click_rate,
                            imported_at = NOW()
                        """,
                        (
                            s["id"],
                            int(stats.get("sent") or 0),
                            int(stats.get("opened") or 0),
                            int(stats.get("clicked") or 0),
                            int(stats.get("bounced") or 0),
                            float(stats.get("open_rate") or 0),
                            float(stats.get("click_rate") or 0),
                        ),
                    )
        conn.commit()


def import_tags(client: KitClient) -> int:
    print("Fetching tags from Kit API...")
    tags = client.list_tags()
    print(f"  Found {len(tags)} tags")

    with get_db() as conn:
        with conn.cursor() as cur:
            for t in tags:
                tid = t.get("id")
                if not tid:
                    continue
                cur.execute(
                    """
                    INSERT INTO kit_tags (id, name, created_at, imported_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        created_at = EXCLUDED.created_at,
                        imported_at = NOW()
                    """,
                    (tid, t.get("name"), _parse_ts(t.get("created_at"))),
                )
        conn.commit()

    print("Fetching tag memberships...")
    total_memberships = 0
    for i, t in enumerate(tags):
        tid = t.get("id")
        if not tid:
            continue

        subs = client.list_subscribers_for_tag(tid)

        with get_db() as conn:
            with conn.cursor() as cur:
                for s in subs:
                    sid = s.get("id")
                    if not sid:
                        continue
                    cur.execute(
                        """
                        INSERT INTO kit_tag_subscribers (tag_id, subscriber_id, tagged_at)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (tag_id, subscriber_id) DO UPDATE SET
                            tagged_at = EXCLUDED.tagged_at
                        """,
                        (tid, sid, _parse_ts(s.get("tagged_at"))),
                    )
                total_memberships += len(subs)
            conn.commit()

        if (i + 1) % 5 == 0:
            print(f"  Fetched members for {i + 1}/{len(tags)} tags")

    print(f"  Imported {len(tags)} tags, {total_memberships} memberships")
    return len(tags)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Kit API data into raw tables")
    parser.add_argument("--fresh", action="store_true", help="Re-fetch all data")
    args = parser.parse_args()

    print("=" * 60)
    print("Kit Raw Data Import")
    print("=" * 60)
    print()

    print("Running migrations...")
    run_migrations()
    print()

    client = KitClient()
    try:
        bc = import_broadcasts(client)
        print()
        sc = import_subscribers(client, resume=not args.fresh)
        print()
        tc = import_tags(client)
    finally:
        client.close()

    print()
    print("=" * 60)
    print(f"Import complete!")
    print(f"  Broadcasts: {bc}")
    print(f"  Subscribers: {sc}")
    print(f"  Tags: {tc}")
    print("=" * 60)


if __name__ == "__main__":
    main()
