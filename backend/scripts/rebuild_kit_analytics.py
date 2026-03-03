#!/usr/bin/env python3
"""
Rebuild analytics tables from Kit raw tables (kit_*).
Reads only from local DB, no API calls. Fast and repeatable.

Usage:
    cd backend
    python scripts/rebuild_kit_analytics.py

Idempotent - uses ON CONFLICT DO UPDATE on all inserts.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations


def _kit_id_to_uuid(kit_id: int) -> UUID:
    hex_id = format(kit_id, "012x")
    return UUID(f"00000000-0000-0000-0000-{hex_id}")


def _normalize_rate(value: float) -> float:
    rate = float(value or 0)
    if rate <= 1.0:
        rate *= 100
    return min(rate, 999.9999)


def _resolve_subscriber_filter(
    subscriber_filter: list | None,
    all_emails: set[str],
    tag_emails: dict[int, set[str]],
) -> set[str]:
    if not subscriber_filter:
        return set()

    result: set[str] | None = None

    for filter_group in subscriber_filter:
        conditions = filter_group.get("all", [])
        group_emails: set[str] | None = None

        for condition in conditions:
            cond_type = condition.get("type", "")
            matched: set[str] = set()

            if cond_type == "all_subscribers":
                matched = set(all_emails)
            elif cond_type == "tag":
                for tid in condition.get("ids", []):
                    matched |= tag_emails.get(int(tid), set())
            elif cond_type == "email_address":
                comparison = condition.get("comparison", "")
                value = (condition.get("value") or "").strip().lower()
                if comparison == "is":
                    if value in all_emails:
                        matched.add(value)
                elif comparison == "contains":
                    matched = {e for e in all_emails if value in e}
                elif comparison == "does_not_contain":
                    matched = {e for e in all_emails if value not in e}
                elif comparison == "starts_with":
                    matched = {e for e in all_emails if e.startswith(value)}
                elif comparison == "ends_with":
                    matched = {e for e in all_emails if e.endswith(value)}
                else:
                    matched = set(all_emails)
            else:
                continue

            group_emails = matched if group_emails is None else (group_emails & matched)

        if group_emails is None:
            group_emails = set()
        result = group_emails if result is None else (result | group_emails)

    return result or set()


def rebuild() -> None:
    print("Loading Kit raw data from DB...")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM kit_broadcasts")
            broadcasts = cur.fetchall()

            cur.execute("SELECT * FROM kit_broadcast_stats")
            stats_rows = cur.fetchall()
            broadcast_stats = {r["broadcast_id"]: r for r in stats_rows}

            cur.execute("SELECT * FROM kit_subscribers")
            subscribers = cur.fetchall()

            cur.execute("SELECT * FROM kit_subscriber_stats")
            sub_stats_rows = cur.fetchall()
            subscriber_stats = {r["subscriber_id"]: r for r in sub_stats_rows}

            cur.execute("SELECT * FROM kit_tags")
            tags = cur.fetchall()

            cur.execute("SELECT * FROM kit_tag_subscribers")
            tag_sub_rows = cur.fetchall()

    print(f"  Broadcasts: {len(broadcasts)}, Subscribers: {len(subscribers)}, Tags: {len(tags)}")

    tag_emails: dict[int, set[str]] = {}
    sub_by_id: dict[int, dict] = {s["id"]: s for s in subscribers}
    for row in tag_sub_rows:
        tid = row["tag_id"]
        sid = row["subscriber_id"]
        sub = sub_by_id.get(sid)
        if sub:
            tag_emails.setdefault(tid, set()).add(sub["email_address"].strip().lower())

    all_emails = {s["email_address"].strip().lower() for s in subscribers if s.get("email_address")}

    email_to_tag_ids: dict[str, set[int]] = {}
    for row in tag_sub_rows:
        sub = sub_by_id.get(row["subscriber_id"])
        if sub:
            email = sub["email_address"].strip().lower()
            email_to_tag_ids.setdefault(email, set()).add(row["tag_id"])

    # --- Write to analytics tables ---

    print("Writing Kit broadcasts to analytics...")
    with get_db() as conn:
        with conn.cursor() as cur:
            for b in broadcasts:
                bid = b["id"]
                uuid_id = _kit_id_to_uuid(bid)
                stats = broadcast_stats.get(bid, {})

                recipients = int(stats.get("recipients") or 0)
                emails_opened = int(stats.get("emails_opened") or 0)
                total_clicks = int(stats.get("total_clicks") or 0)
                open_rate = _normalize_rate(stats.get("open_rate") or 0)
                click_rate = _normalize_rate(stats.get("click_rate") or 0)

                sf = b.get("subscriber_filter")
                if isinstance(sf, str):
                    sf = json.loads(sf)

                segment_id = None
                if sf:
                    for fg in sf:
                        for cond in fg.get("all", []):
                            if cond.get("type") == "tag":
                                tag_ids = cond.get("ids", [])
                                if len(tag_ids) == 1:
                                    segment_id = _kit_id_to_uuid(int(tag_ids[0]))

                cur.execute(
                    """
                    INSERT INTO analytics_broadcasts (
                        id, name, subject, from_address, status, segment_id,
                        created_at, sent_at, html_content, preview_text,
                        total_sent, total_delivered, total_opened, total_clicked,
                        total_bounced, total_suppressed, open_rate, click_rate,
                        source, synced_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, 0, 0, %s, %s, 'kit', NOW()
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name, subject = EXCLUDED.subject,
                        from_address = EXCLUDED.from_address, status = EXCLUDED.status,
                        segment_id = EXCLUDED.segment_id, created_at = EXCLUDED.created_at,
                        sent_at = EXCLUDED.sent_at, html_content = EXCLUDED.html_content,
                        preview_text = EXCLUDED.preview_text,
                        total_sent = EXCLUDED.total_sent, total_delivered = EXCLUDED.total_delivered,
                        total_opened = EXCLUDED.total_opened, total_clicked = EXCLUDED.total_clicked,
                        open_rate = EXCLUDED.open_rate, click_rate = EXCLUDED.click_rate,
                        source = 'kit', synced_at = NOW()
                    """,
                    (
                        uuid_id,
                        b.get("subject") or "",
                        b.get("subject"),
                        b.get("email_address"),
                        stats.get("status") or "unknown",
                        segment_id,
                        b.get("created_at"),
                        b.get("send_at"),
                        b.get("content"),
                        b.get("preview_text"),
                        recipients,
                        recipients,
                        emails_opened,
                        total_clicks,
                        round(open_rate, 4),
                        round(click_rate, 4),
                    ),
                )
        conn.commit()
    print(f"  Wrote {len(broadcasts)} broadcasts")

    print("Writing Kit broadcast recipients to analytics...")
    recipient_count = 0
    with get_db() as conn:
        with conn.cursor() as cur:
            for b in broadcasts:
                bid = b["id"]
                uuid_id = _kit_id_to_uuid(bid)
                sf = b.get("subscriber_filter")
                if isinstance(sf, str):
                    sf = json.loads(sf)

                resolved = _resolve_subscriber_filter(sf, all_emails, tag_emails)
                if not resolved:
                    continue

                rows = [
                    (uuid_id, f"kit-{bid}-{email}", email, b.get("subject"), b.get("send_at"))
                    for email in resolved
                ]
                cur.executemany(
                    """
                    INSERT INTO analytics_broadcast_recipients (
                        broadcast_id, email_id, email_address, subject, sent_at, source
                    ) VALUES (%s, %s, %s, %s, %s, 'kit')
                    ON CONFLICT (broadcast_id, email_id) DO UPDATE SET
                        email_address = EXCLUDED.email_address,
                        subject = EXCLUDED.subject,
                        sent_at = EXCLUDED.sent_at,
                        source = 'kit',
                        updated_at = NOW()
                    """,
                    rows,
                )
                recipient_count += len(rows)
        conn.commit()
    print(f"  Wrote {recipient_count} broadcast recipients")

    print("Writing Kit contacts to analytics...")
    with get_db() as conn:
        with conn.cursor() as cur:
            for s in subscribers:
                email = (s.get("email_address") or "").strip().lower()
                if not email:
                    continue

                stats = subscriber_stats.get(s["id"], {})
                state = s.get("state") or ""
                unsubscribed = state in ("cancelled", "bounced", "complained")

                total_sent = int(stats.get("sent") or 0)
                total_opened = int(stats.get("opened") or 0)
                total_clicked = int(stats.get("clicked") or 0)
                total_bounced = int(stats.get("bounced") or 0)
                open_rate = _normalize_rate(stats.get("open_rate") or 0)
                click_rate = _normalize_rate(stats.get("click_rate") or 0)

                tag_ids = email_to_tag_ids.get(email, set())
                segment_ids = sorted(str(_kit_id_to_uuid(tid)) for tid in tag_ids)

                cur.execute(
                    """
                    INSERT INTO analytics_contacts (
                        id, email, first_name, unsubscribed, segment_ids,
                        total_sent, total_delivered, total_opened, total_clicked,
                        total_bounced, total_suppressed, open_rate, click_rate,
                        source, synced_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s, 'kit', NOW()
                    )
                    ON CONFLICT (email, source) DO UPDATE SET
                        first_name = EXCLUDED.first_name,
                        unsubscribed = EXCLUDED.unsubscribed,
                        segment_ids = EXCLUDED.segment_ids,
                        total_sent = EXCLUDED.total_sent,
                        total_delivered = EXCLUDED.total_delivered,
                        total_opened = EXCLUDED.total_opened,
                        total_clicked = EXCLUDED.total_clicked,
                        total_bounced = EXCLUDED.total_bounced,
                        open_rate = EXCLUDED.open_rate,
                        click_rate = EXCLUDED.click_rate,
                        synced_at = NOW()
                    """,
                    (
                        f"kit-{s['id']}",
                        email,
                        s.get("first_name"),
                        unsubscribed,
                        segment_ids,
                        total_sent,
                        total_sent,
                        total_opened,
                        total_clicked,
                        total_bounced,
                        round(open_rate, 4),
                        round(click_rate, 4),
                    ),
                )
        conn.commit()
    print(f"  Wrote {len(subscribers)} contacts")

    print("Writing Kit tags to analytics segments...")
    with get_db() as conn:
        with conn.cursor() as cur:
            for t in tags:
                tid = t["id"]
                uuid_id = _kit_id_to_uuid(tid)
                cur.execute(
                    """
                    INSERT INTO analytics_segments (id, name, created_at, source, synced_at)
                    VALUES (%s, %s, %s, 'kit', NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        created_at = EXCLUDED.created_at,
                        source = 'kit',
                        synced_at = NOW()
                    """,
                    (uuid_id, t["name"], t.get("created_at")),
                )
        conn.commit()
    print(f"  Wrote {len(tags)} segments")

    print("Capturing Kit snapshots...")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analytics_broadcast_snapshots
                    (broadcast_id, total_sent, total_delivered, total_opened,
                     total_clicked, open_rate, click_rate, captured_at)
                SELECT id, total_sent, total_delivered, total_opened,
                       total_clicked, open_rate, click_rate,
                       COALESCE(sent_at, created_at, NOW())
                FROM analytics_broadcasts
                WHERE source = 'kit'
                """
            )
            for t in tags:
                tid = t["id"]
                uuid_id = _kit_id_to_uuid(tid)
                member_count = len(tag_emails.get(tid, set()))
                cur.execute(
                    """
                    INSERT INTO analytics_segment_snapshots
                        (segment_id, total_contacts, captured_at)
                    VALUES (%s, %s, COALESCE(%s, NOW()))
                    """,
                    (uuid_id, member_count, t.get("created_at")),
                )
        conn.commit()
    print("  Snapshots captured")


def main() -> None:
    print("=" * 60)
    print("Rebuild Kit Analytics from Raw Tables")
    print("=" * 60)
    print()

    print("Running migrations...")
    run_migrations()
    print()

    rebuild()

    print()
    print("=" * 60)
    print("Kit analytics rebuild complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
