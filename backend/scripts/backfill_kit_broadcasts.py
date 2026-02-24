#!/usr/bin/env python3
"""
Backfill Kit broadcast data:
  1. Re-fetch broadcast stats and update analytics_broadcasts
  2. Fetch subscriber_filter, resolve to recipients, populate analytics_broadcast_recipients
  3. Set segment_id on broadcasts that target a specific tag

Usage:
    cd backend
    python scripts/backfill_kit_broadcasts.py

Idempotent - safe to run multiple times.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations
from services.kit_client import KitClient


def _kit_id_to_uuid(kit_id: int) -> UUID:
    hex_id = format(kit_id, "012x")
    return UUID(f"00000000-0000-0000-0000-{hex_id}")


def _normalize_rate(value: Any) -> float:
    rate = float(value or 0)
    if rate <= 1.0:
        rate = rate * 100
    return min(rate, 999.9999)


def _uuid_to_kit_id(uuid_val: UUID | str) -> int:
    hex_str = str(uuid_val).replace("-", "")[-12:]
    return int(hex_str, 16)


def _resolve_subscriber_filter(
    filters: list[dict[str, Any]],
    all_subscribers: dict[str, dict[str, Any]],
    tag_subscribers: dict[int, set[str]],
) -> set[str]:
    """Resolve subscriber_filter to a set of email addresses."""
    if not filters:
        return set()

    result: set[str] | None = None

    for filter_group in filters:
        conditions = filter_group.get("all", [])
        group_emails: set[str] | None = None

        for condition in conditions:
            cond_type = condition.get("type", "")
            matched: set[str] = set()

            if cond_type == "all_subscribers":
                matched = set(all_subscribers.keys())

            elif cond_type == "tag":
                tag_ids = condition.get("ids", [])
                for tid in tag_ids:
                    matched |= tag_subscribers.get(int(tid), set())

            elif cond_type == "email_address":
                comparison = condition.get("comparison", "")
                value = (condition.get("value") or "").strip().lower()
                if comparison == "is":
                    if value in all_subscribers:
                        matched.add(value)
                elif comparison == "contains":
                    matched = {e for e in all_subscribers if value in e}
                elif comparison == "does_not_contain":
                    matched = {e for e in all_subscribers if value not in e}
                elif comparison == "starts_with":
                    matched = {e for e in all_subscribers if e.startswith(value)}
                elif comparison == "ends_with":
                    matched = {e for e in all_subscribers if e.endswith(value)}
                else:
                    matched = set(all_subscribers.keys())

            else:
                continue

            if group_emails is None:
                group_emails = matched
            else:
                group_emails &= matched

        if group_emails is None:
            group_emails = set()

        if result is None:
            result = group_emails
        else:
            result |= group_emails

    return result or set()


def main() -> None:
    print("=" * 60)
    print("Kit Broadcast Backfill")
    print("=" * 60)
    print()

    print("Running migrations...")
    run_migrations()
    print()

    client = KitClient()

    print("Loading Kit subscribers from DB...")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email FROM analytics_contacts WHERE source = 'kit'"
            )
            all_subscribers = {
                row["email"]: row for row in cur.fetchall()
            }
    print(f"  {len(all_subscribers)} subscribers in DB")

    print("Fetching tag memberships from Kit API...")
    tags = client.list_tags()
    tag_subscribers: dict[int, set[str]] = {}
    for i, t in enumerate(tags):
        tid = t.get("id")
        if tid:
            subs = client.list_subscribers_for_tag(tid)
            tag_subscribers[tid] = {
                str(s.get("email_address") or "").strip().lower()
                for s in subs
            }
            tag_subscribers[tid].discard("")
            if (i + 1) % 5 == 0:
                print(f"  Fetched members for {i + 1}/{len(tags)} tags")
    print(f"  Fetched members for {len(tag_subscribers)} tags")

    print()
    print("Loading Kit broadcasts from DB...")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM analytics_broadcasts WHERE source = 'kit'"
            )
            kit_broadcast_uuids = [row["id"] for row in cur.fetchall()]
    print(f"  {len(kit_broadcast_uuids)} Kit broadcasts in DB")

    print()
    print("Processing broadcasts...")
    print("-" * 60)

    total_recipients_written = 0

    for i, uuid_id in enumerate(kit_broadcast_uuids):
        kit_id = _uuid_to_kit_id(uuid_id)

        try:
            broadcast = client.get_broadcast(kit_id)
        except Exception as e:
            print(f"  [{i+1}/{len(kit_broadcast_uuids)}] {kit_id}: Failed to fetch broadcast: {e}")
            continue

        try:
            stats = client.get_broadcast_stats(kit_id)
        except Exception as e:
            print(f"  [{i+1}/{len(kit_broadcast_uuids)}] {kit_id}: Failed to fetch stats: {e}")
            stats = {}

        subject = broadcast.get("subject") or ""
        subscriber_filter = broadcast.get("subscriber_filter") or []
        send_at = broadcast.get("send_at")

        # Resolve segment_id from subscriber_filter
        segment_id: UUID | None = None
        for fg in subscriber_filter:
            for cond in fg.get("all", []):
                if cond.get("type") == "tag":
                    tag_ids = cond.get("ids", [])
                    if len(tag_ids) == 1:
                        segment_id = _kit_id_to_uuid(int(tag_ids[0]))

        # Update broadcast stats + segment_id
        recipients_count = int(stats.get("recipients") or 0)
        emails_opened = int(stats.get("emails_opened") or 0)
        total_clicks = int(stats.get("total_clicks") or 0)
        open_rate = _normalize_rate(stats.get("open_rate"))
        click_rate = _normalize_rate(stats.get("click_rate"))

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE analytics_broadcasts
                    SET total_sent = %s,
                        total_delivered = %s,
                        total_opened = %s,
                        total_clicked = %s,
                        open_rate = %s,
                        click_rate = %s,
                        segment_id = %s,
                        synced_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        recipients_count,
                        recipients_count,
                        emails_opened,
                        total_clicks,
                        round(open_rate, 4),
                        round(click_rate, 4),
                        segment_id,
                        uuid_id,
                    ),
                )
            conn.commit()

        # Resolve recipients from subscriber_filter
        resolved_emails = _resolve_subscriber_filter(
            subscriber_filter, all_subscribers, tag_subscribers
        )

        if resolved_emails:
            rows = [
                (
                    uuid_id,
                    f"kit-{kit_id}-{email}",
                    email,
                    subject,
                    send_at,
                )
                for email in sorted(resolved_emails)
            ]

            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO analytics_broadcast_recipients (
                            broadcast_id, email_id, email_address, subject,
                            sent_at, source
                        )
                        VALUES (%s, %s, %s, %s, %s, 'kit')
                        ON CONFLICT (broadcast_id, email_id)
                        DO UPDATE SET
                            email_address = EXCLUDED.email_address,
                            subject = EXCLUDED.subject,
                            sent_at = EXCLUDED.sent_at,
                            source = EXCLUDED.source,
                            updated_at = NOW()
                        """,
                        rows,
                    )
                conn.commit()

            total_recipients_written += len(rows)

        tag_label = f" (tag: {segment_id})" if segment_id else ""
        print(
            f"  [{i+1}/{len(kit_broadcast_uuids)}] {subject[:50]:50} | "
            f"sent={recipients_count} opened={emails_opened} "
            f"recipients={len(resolved_emails)}{tag_label}"
        )

    client.close()

    print("-" * 60)
    print()
    print("Backfill Summary:")
    print(f"  Broadcasts updated:       {len(kit_broadcast_uuids)}")
    print(f"  Total recipients written:  {total_recipients_written}")
    print()
    print("=" * 60)
    print("Backfill complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
