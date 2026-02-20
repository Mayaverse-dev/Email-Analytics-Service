from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any
from uuid import UUID

from database import get_db
from services.kit_client import KitClient


def _kit_id_to_uuid(kit_id: int) -> UUID:
    hex_id = format(kit_id, "012x")
    return UUID(f"00000000-0000-0000-0000-{hex_id}")


def _normalize_rate(value: Any) -> float:
    """Convert rate to percentage, handling both 0-1 and 0-100 formats."""
    rate = float(value or 0)
    if rate <= 1.0:
        rate = rate * 100
    return min(rate, 999.9999)


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


class KitSyncService:
    BATCH_SIZE = 100

    def __init__(self, resume: bool = True) -> None:
        self._resume = resume

    def _get_existing_contacts(self) -> set[str]:
        if not self._resume:
            return set()
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT email FROM analytics_contacts WHERE source = 'kit'"
                )
                return {row["email"] for row in cur.fetchall()}

    def sync(self) -> dict[str, Any]:
        client = KitClient()
        try:
            return self._run_sync(client)
        finally:
            client.close()

    def _run_sync(self, client: KitClient) -> dict[str, Any]:
        existing_emails = self._get_existing_contacts()
        if existing_emails:
            print(f"Resume mode: found {len(existing_emails)} existing contacts, will skip")

        print("Fetching tags from Kit...")
        tags = client.list_tags()
        print(f"  Found {len(tags)} tags")

        print("Fetching tag memberships...")
        tag_subscribers: dict[int, list[dict[str, Any]]] = {}
        for i, t in enumerate(tags):
            tid = t.get("id")
            if tid:
                tag_subscribers[tid] = client.list_subscribers_for_tag(tid)
                if (i + 1) % 5 == 0:
                    print(f"  Fetched members for {i + 1}/{len(tags)} tags")
        print(f"  Fetched members for {len(tag_subscribers)} tags")

        print("Writing segments to database...")
        segment_count = self._write_segments(tags, tag_subscribers)
        print(f"  Upserted {segment_count} segments")

        print("Fetching broadcasts from Kit...")
        broadcasts = client.list_broadcasts()
        print(f"  Found {len(broadcasts)} broadcasts")

        print("Fetching broadcast stats and writing to database...")
        broadcast_count = 0
        for i, b in enumerate(broadcasts):
            bid = b.get("id")
            if bid:
                stats = client.get_broadcast_stats(bid)
                self._write_single_broadcast(b, stats)
                broadcast_count += 1
                if (i + 1) % 10 == 0:
                    print(f"  Processed {i + 1}/{len(broadcasts)} broadcasts")
        print(f"  Imported {broadcast_count} broadcasts")

        print("Fetching subscribers from Kit...")
        subscribers = client.list_subscribers(status="all")
        print(f"  Found {len(subscribers)} subscribers")

        print("Fetching subscriber stats and writing to database in batches...")
        contact_count = 0
        skipped = 0
        batch: list[tuple[dict[str, Any], dict[str, Any]]] = []

        for i, s in enumerate(subscribers):
            sid = s.get("id")
            email = str(s.get("email_address") or "").strip().lower()
            if sid:
                if email in existing_emails:
                    skipped += 1
                else:
                    stats = client.get_subscriber_stats(sid)
                    batch.append((s, stats))

                    if len(batch) >= self.BATCH_SIZE:
                        self._write_contact_batch(batch, tags, tag_subscribers)
                        contact_count += len(batch)
                        batch = []

                if (i + 1) % 100 == 0:
                    print(f"  Processed {i + 1}/{len(subscribers)} subscribers (imported: {contact_count}, skipped: {skipped})")

        if batch:
            self._write_contact_batch(batch, tags, tag_subscribers)
            contact_count += len(batch)

        print(f"  Imported {contact_count} contacts, skipped {skipped} existing")
        print("Done!")

        return {
            "broadcasts_imported": broadcast_count,
            "contacts_imported": contact_count,
            "segments_imported": segment_count,
        }

    def _write_single_broadcast(self, b: dict[str, Any], stats: dict[str, Any]) -> None:
        bid = b.get("id")
        if not bid:
            return

        uuid_id = _kit_id_to_uuid(bid)
        recipients = int(stats.get("recipients") or 0)
        emails_opened = int(stats.get("emails_opened") or 0)
        total_clicks = int(stats.get("total_clicks") or 0)
        open_rate = _normalize_rate(stats.get("open_rate"))
        click_rate = _normalize_rate(stats.get("click_rate"))

        row = (
            uuid_id,
            b.get("subject") or "",
            b.get("subject"),
            b.get("email_address"),
            stats.get("status") or "unknown",
            None,
            _parse_timestamp(b.get("created_at")),
            _parse_timestamp(b.get("send_at")),
            b.get("content"),
            None,
            b.get("preview_text"),
            None,
            recipients,
            recipients,
            emails_opened,
            total_clicks,
            0,
            0,
            round(open_rate, 4),
            round(click_rate, 4),
            "kit",
        )

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO analytics_broadcasts (
                        id, name, subject, from_address, status, segment_id,
                        created_at, sent_at, html_content, text_content,
                        preview_text, reply_to, total_sent, total_delivered,
                        total_opened, total_clicked, total_bounced, total_suppressed,
                        open_rate, click_rate, source, synced_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    )
                    ON CONFLICT (id)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        subject = EXCLUDED.subject,
                        from_address = EXCLUDED.from_address,
                        status = EXCLUDED.status,
                        created_at = EXCLUDED.created_at,
                        sent_at = EXCLUDED.sent_at,
                        html_content = EXCLUDED.html_content,
                        preview_text = EXCLUDED.preview_text,
                        total_sent = EXCLUDED.total_sent,
                        total_delivered = EXCLUDED.total_delivered,
                        total_opened = EXCLUDED.total_opened,
                        total_clicked = EXCLUDED.total_clicked,
                        open_rate = EXCLUDED.open_rate,
                        click_rate = EXCLUDED.click_rate,
                        source = EXCLUDED.source,
                        synced_at = NOW()
                    """,
                    row,
                )
            conn.commit()

    def _write_contact_batch(
        self,
        batch: list[tuple[dict[str, Any], dict[str, Any]]],
        tags: list[dict[str, Any]],
        tag_subscribers: dict[int, list[dict[str, Any]]],
    ) -> None:
        email_to_tags: dict[str, set[str]] = defaultdict(set)
        for tag in tags:
            tid = tag.get("id")
            if not tid:
                continue
            tag_uuid = str(_kit_id_to_uuid(tid))
            for sub in tag_subscribers.get(tid, []):
                email = str(sub.get("email_address") or "").strip().lower()
                if email:
                    email_to_tags[email].add(tag_uuid)

        rows: list[tuple[Any, ...]] = []
        for s, stats in batch:
            sid = s.get("id")
            if not sid:
                continue

            email = str(s.get("email_address") or "").strip().lower()
            if not email:
                continue

            state = str(s.get("state") or "")
            unsubscribed = state in ("cancelled", "bounced", "complained")

            total_sent = int(stats.get("sent") or 0)
            total_opened = int(stats.get("opened") or 0)
            total_clicked = int(stats.get("clicked") or 0)
            total_bounced = int(stats.get("bounced") or 0)
            open_rate = _normalize_rate(stats.get("open_rate"))
            click_rate = _normalize_rate(stats.get("click_rate"))

            tag_ids = sorted(email_to_tags.get(email, set()))

            rows.append((
                f"kit-{sid}",
                email,
                s.get("first_name"),
                None,
                unsubscribed,
                tag_ids,
                total_sent,
                total_sent,
                total_opened,
                total_clicked,
                total_bounced,
                0,
                round(open_rate, 4),
                round(click_rate, 4),
                "kit",
            ))

        if rows:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO analytics_contacts (
                            id, email, first_name, last_name, unsubscribed,
                            segment_ids, total_sent, total_delivered, total_opened,
                            total_clicked, total_bounced, total_suppressed,
                            open_rate, click_rate, source, synced_at
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                        )
                        ON CONFLICT (email, source)
                        DO UPDATE SET
                            id = EXCLUDED.id,
                            first_name = EXCLUDED.first_name,
                            last_name = EXCLUDED.last_name,
                            unsubscribed = EXCLUDED.unsubscribed,
                            segment_ids = EXCLUDED.segment_ids,
                            total_sent = EXCLUDED.total_sent,
                            total_delivered = EXCLUDED.total_delivered,
                            total_opened = EXCLUDED.total_opened,
                            total_clicked = EXCLUDED.total_clicked,
                            total_bounced = EXCLUDED.total_bounced,
                            total_suppressed = EXCLUDED.total_suppressed,
                            open_rate = EXCLUDED.open_rate,
                            click_rate = EXCLUDED.click_rate,
                            synced_at = NOW()
                        """,
                        rows,
                    )
                conn.commit()

    def _write_segments(
        self,
        tags: list[dict[str, Any]],
        tag_subscribers: dict[int, list[dict[str, Any]]],
    ) -> int:
        rows: list[tuple[Any, ...]] = []
        for t in tags:
            tid = t.get("id")
            if not tid:
                continue

            uuid_id = _kit_id_to_uuid(tid)
            subscriber_count = len(tag_subscribers.get(tid, []))

            rows.append((
                uuid_id,
                t.get("name") or "",
                _parse_timestamp(t.get("created_at")),
                subscriber_count,
                "kit",
            ))

        if rows:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO analytics_segments (
                            id, name, created_at, total_contacts, source, synced_at
                        )
                        VALUES (%s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (id)
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            created_at = EXCLUDED.created_at,
                            total_contacts = EXCLUDED.total_contacts,
                            source = EXCLUDED.source,
                            synced_at = NOW()
                        """,
                        rows,
                    )
                conn.commit()

        return len(rows)
