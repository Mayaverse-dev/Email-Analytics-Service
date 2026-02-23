from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from database import get_db
from services.resend_client import ResendClient


def _parse_uuid(value: Any) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


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


class SyncService:
    def sync(self) -> dict[str, Any]:
        metadata = self._fetch_metadata()

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO analytics_sync_log (status, started_at)
                    VALUES ('running', NOW())
                    RETURNING id
                    """
                )
                sync_log_id = cur.fetchone()["id"]
            conn.commit()

            try:
                sync_result = self._sync_to_analytics(conn, metadata)
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE analytics_sync_log
                        SET completed_at = NOW(),
                            status = 'success',
                            events_processed = %s,
                            last_processed_webhook_received_at = %s
                        WHERE id = %s
                        """,
                        (
                            sync_result["events_processed"],
                            sync_result["last_processed_webhook_received_at"],
                            sync_log_id,
                        ),
                    )
                conn.commit()
                return sync_result
            except Exception as exc:
                conn.rollback()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE analytics_sync_log
                        SET completed_at = NOW(),
                            status = 'failed',
                            error_message = %s
                        WHERE id = %s
                        """,
                        (str(exc), sync_log_id),
                    )
                conn.commit()
                raise

    def _fetch_metadata(self) -> dict[str, Any]:
        client = ResendClient()
        try:
            broadcast_summaries = client.list_broadcasts()
            broadcast_details: list[dict[str, Any]] = []
            for summary in broadcast_summaries:
                broadcast_id = str(summary.get("id", "")).strip()
                if not broadcast_id:
                    continue
                try:
                    broadcast_details.append(client.get_broadcast(broadcast_id))
                except RuntimeError:
                    broadcast_details.append(summary)

            segments = client.list_segments()
            contacts = client.list_contacts()

            return {
                "broadcasts": broadcast_details,
                "segments": segments,
                "contacts": contacts,
            }
        finally:
            client.close()

    def _sync_to_analytics(self, conn: Any, metadata: dict[str, Any]) -> dict[str, Any]:
        broadcasts = metadata["broadcasts"]
        segments = metadata["segments"]
        contacts = metadata["contacts"]

        with conn.cursor() as cur:
            broadcast_upserts: list[tuple[Any, ...]] = []
            for broadcast in broadcasts:
                broadcast_id = _parse_uuid(broadcast.get("id"))
                if not broadcast_id:
                    continue
                segment_id = _parse_uuid(
                    broadcast.get("segment_id") or broadcast.get("audience_id")
                )
                broadcast_upserts.append(
                    (
                        broadcast_id,
                        str(broadcast.get("name") or ""),
                        broadcast.get("subject"),
                        broadcast.get("from"),
                        str(broadcast.get("status") or "unknown"),
                        segment_id,
                        _parse_timestamp(broadcast.get("created_at")),
                        _parse_timestamp(broadcast.get("sent_at")),
                        broadcast.get("html"),
                        broadcast.get("text"),
                        broadcast.get("preview_text"),
                        broadcast.get("reply_to"),
                    )
                )

            if broadcast_upserts:
                cur.executemany(
                    """
                    INSERT INTO analytics_broadcasts (
                        id, name, subject, from_address, status, segment_id, created_at, sent_at,
                        html_content, text_content, preview_text, reply_to, synced_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (id)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        subject = EXCLUDED.subject,
                        from_address = EXCLUDED.from_address,
                        status = EXCLUDED.status,
                        segment_id = EXCLUDED.segment_id,
                        created_at = EXCLUDED.created_at,
                        sent_at = EXCLUDED.sent_at,
                        html_content = EXCLUDED.html_content,
                        text_content = EXCLUDED.text_content,
                        preview_text = EXCLUDED.preview_text,
                        reply_to = EXCLUDED.reply_to,
                        synced_at = NOW()
                    """,
                    broadcast_upserts,
                )

            segment_upserts: list[tuple[Any, ...]] = []
            for segment in segments:
                segment_id = _parse_uuid(segment.get("id"))
                if not segment_id:
                    continue
                segment_upserts.append(
                    (
                        segment_id,
                        str(segment.get("name") or ""),
                        _parse_timestamp(segment.get("created_at")),
                        0,
                    )
                )

            if segment_upserts:
                cur.executemany(
                    """
                    INSERT INTO analytics_segments (id, name, created_at, total_contacts, synced_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (id)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        created_at = EXCLUDED.created_at,
                        total_contacts = EXCLUDED.total_contacts,
                        synced_at = NOW()
                    """,
                    segment_upserts,
                )

            cur.execute(
                """
                SELECT
                  broadcast_id,
                  email_id,
                  event_type,
                  to_addresses,
                  subject,
                  event_created_at,
                  webhook_received_at
                FROM resend_wh_emails
                WHERE broadcast_id IS NOT NULL
                ORDER BY event_created_at ASC
                """
            )
            events = cur.fetchall()

            recipient_events: dict[tuple[UUID, str], dict[str, Any]] = {}
            max_webhook_received_at: datetime | None = None
            for event in events:
                broadcast_id = _parse_uuid(event["broadcast_id"])
                email_id = str(event["email_id"])
                if not broadcast_id or not email_id:
                    continue

                key = (broadcast_id, email_id)
                row = recipient_events.get(key)
                if row is None:
                    to_addresses = event.get("to_addresses") or []
                    email_address = (
                        str(to_addresses[0]).strip().lower() if to_addresses else ""
                    )
                    row = {
                        "broadcast_id": broadcast_id,
                        "email_id": email_id,
                        "email_address": email_address,
                        "subject": event.get("subject"),
                        "sent_at": None,
                        "delivered_at": None,
                        "opened_at": None,
                        "clicked_at": None,
                        "bounced_at": None,
                        "suppressed_at": None,
                        "open_count": 0,
                        "click_count": 0,
                        "last_event_at": None,
                    }
                    recipient_events[key] = row

                event_time = _parse_timestamp(event.get("event_created_at"))
                event_type = str(event.get("event_type") or "")
                if event_type == "email.sent":
                    row["sent_at"] = row["sent_at"] or event_time
                elif event_type == "email.delivered":
                    row["delivered_at"] = row["delivered_at"] or event_time
                elif event_type == "email.opened":
                    row["opened_at"] = row["opened_at"] or event_time
                    row["open_count"] += 1
                elif event_type == "email.clicked":
                    row["clicked_at"] = row["clicked_at"] or event_time
                    row["click_count"] += 1
                elif event_type == "email.bounced":
                    row["bounced_at"] = row["bounced_at"] or event_time
                elif event_type == "email.suppressed":
                    row["suppressed_at"] = row["suppressed_at"] or event_time

                last_event_at = row["last_event_at"]
                if not last_event_at or (event_time and event_time > last_event_at):
                    row["last_event_at"] = event_time

                webhook_received_at = _parse_timestamp(event.get("webhook_received_at"))
                if webhook_received_at and (
                    not max_webhook_received_at
                    or webhook_received_at > max_webhook_received_at
                ):
                    max_webhook_received_at = webhook_received_at

            if recipient_events:
                missing_broadcasts = {(item["broadcast_id"],) for item in recipient_events.values()}
                cur.executemany(
                    """
                    INSERT INTO analytics_broadcasts (id, status, synced_at)
                    VALUES (%s, 'unknown', NOW())
                    ON CONFLICT (id) DO NOTHING
                    """,
                    list(missing_broadcasts),
                )

                cur.executemany(
                    """
                    INSERT INTO analytics_broadcast_recipients (
                        broadcast_id,
                        email_id,
                        email_address,
                        subject,
                        sent_at,
                        delivered_at,
                        opened_at,
                        clicked_at,
                        bounced_at,
                        suppressed_at,
                        open_count,
                        click_count,
                        last_event_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (broadcast_id, email_id)
                    DO UPDATE SET
                        email_address = EXCLUDED.email_address,
                        subject = EXCLUDED.subject,
                        sent_at = EXCLUDED.sent_at,
                        delivered_at = EXCLUDED.delivered_at,
                        opened_at = EXCLUDED.opened_at,
                        clicked_at = EXCLUDED.clicked_at,
                        bounced_at = EXCLUDED.bounced_at,
                        suppressed_at = EXCLUDED.suppressed_at,
                        open_count = EXCLUDED.open_count,
                        click_count = EXCLUDED.click_count,
                        last_event_at = EXCLUDED.last_event_at,
                        updated_at = NOW()
                    """,
                    [
                        (
                            row["broadcast_id"],
                            row["email_id"],
                            row["email_address"],
                            row["subject"],
                            row["sent_at"],
                            row["delivered_at"],
                            row["opened_at"],
                            row["clicked_at"],
                            row["bounced_at"],
                            row["suppressed_at"],
                            row["open_count"],
                            row["click_count"],
                            row["last_event_at"],
                        )
                        for row in recipient_events.values()
                    ],
                )

            cur.execute(
                """
                WITH agg AS (
                  SELECT
                    broadcast_id,
                    COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS total_sent,
                    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS total_delivered,
                    COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS total_opened,
                    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS total_clicked,
                    COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) AS total_bounced,
                    COUNT(*) FILTER (WHERE suppressed_at IS NOT NULL) AS total_suppressed
                  FROM analytics_broadcast_recipients
                  GROUP BY broadcast_id
                )
                UPDATE analytics_broadcasts b
                SET
                  total_sent = COALESCE(agg.total_sent, 0),
                  total_delivered = COALESCE(agg.total_delivered, 0),
                  total_opened = COALESCE(agg.total_opened, 0),
                  total_clicked = COALESCE(agg.total_clicked, 0),
                  total_bounced = COALESCE(agg.total_bounced, 0),
                  total_suppressed = COALESCE(agg.total_suppressed, 0),
                  open_rate = CASE
                    WHEN COALESCE(agg.total_delivered, 0) = 0 THEN 0
                    ELSE ROUND((agg.total_opened::numeric / agg.total_delivered::numeric) * 100, 4)
                  END,
                  click_rate = CASE
                    WHEN COALESCE(agg.total_delivered, 0) = 0 THEN 0
                    ELSE ROUND((agg.total_clicked::numeric / agg.total_delivered::numeric) * 100, 4)
                  END,
                  synced_at = NOW()
                FROM agg
                WHERE b.id = agg.broadcast_id
                """
            )
            cur.execute(
                """
                UPDATE analytics_broadcasts
                SET
                  total_sent = 0,
                  total_delivered = 0,
                  total_opened = 0,
                  total_clicked = 0,
                  total_bounced = 0,
                  total_suppressed = 0,
                  open_rate = 0,
                  click_rate = 0,
                  synced_at = NOW()
                WHERE id NOT IN (SELECT DISTINCT broadcast_id FROM analytics_broadcast_recipients)
                """
            )

            cur.execute(
                """
                SELECT
                  LOWER(email_address) AS email,
                  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS total_sent,
                  COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS total_delivered,
                  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS total_opened,
                  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS total_clicked,
                  COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) AS total_bounced,
                  COUNT(*) FILTER (WHERE suppressed_at IS NOT NULL) AS total_suppressed
                FROM analytics_broadcast_recipients
                WHERE email_address IS NOT NULL AND email_address <> ''
                GROUP BY LOWER(email_address)
                """
            )
            user_agg_rows = cur.fetchall()
            user_agg: dict[str, dict[str, int]] = {
                row["email"]: {
                    "total_sent": int(row["total_sent"] or 0),
                    "total_delivered": int(row["total_delivered"] or 0),
                    "total_opened": int(row["total_opened"] or 0),
                    "total_clicked": int(row["total_clicked"] or 0),
                    "total_bounced": int(row["total_bounced"] or 0),
                    "total_suppressed": int(row["total_suppressed"] or 0),
                }
                for row in user_agg_rows
            }

            contact_by_email: dict[str, dict[str, Any]] = {}
            for contact in contacts:
                email = str(contact.get("email") or "").strip().lower()
                if email:
                    contact_by_email[email] = contact

            contact_rows: list[tuple[Any, ...]] = []
            for email in sorted(user_agg.keys()):
                contact = contact_by_email.get(email, {})
                metrics = user_agg.get(
                    email,
                    {
                        "total_sent": 0,
                        "total_delivered": 0,
                        "total_opened": 0,
                        "total_clicked": 0,
                        "total_bounced": 0,
                        "total_suppressed": 0,
                    },
                )
                contact_id = str(contact.get("id") or "").strip() or f"contact:{email}"
                delivered = metrics["total_delivered"]
                open_rate = (metrics["total_opened"] / delivered * 100) if delivered else 0
                click_rate = (metrics["total_clicked"] / delivered * 100) if delivered else 0

                contact_rows.append(
                    (
                        contact_id,
                        email,
                        contact.get("first_name"),
                        contact.get("last_name"),
                        bool(contact.get("unsubscribed") or False),
                        [],
                        metrics["total_sent"],
                        metrics["total_delivered"],
                        metrics["total_opened"],
                        metrics["total_clicked"],
                        metrics["total_bounced"],
                        metrics["total_suppressed"],
                        round(open_rate, 4),
                        round(click_rate, 4),
                    )
                )

            if contact_rows:
                cur.executemany(
                    """
                    INSERT INTO analytics_contacts (
                        id,
                        email,
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
                        source,
                        synced_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'resend', NOW()
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
                    contact_rows,
                )

            cur.execute(
                """
                INSERT INTO analytics_segments (id, name, synced_at)
                SELECT DISTINCT segment_id, 'Unknown Segment', NOW()
                FROM analytics_broadcasts
                WHERE segment_id IS NOT NULL
                ON CONFLICT (id) DO NOTHING
                """
            )

            cur.execute(
                """
                WITH agg AS (
                  SELECT
                    b.segment_id AS id,
                    COUNT(DISTINCT b.id) AS total_broadcasts,
                    COUNT(r.id) FILTER (WHERE r.delivered_at IS NOT NULL) AS total_delivered,
                    COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL) AS total_opened,
                    COUNT(r.id) FILTER (WHERE r.clicked_at IS NOT NULL) AS total_clicked
                  FROM analytics_broadcasts b
                  LEFT JOIN analytics_broadcast_recipients r ON r.broadcast_id = b.id
                  WHERE b.segment_id IS NOT NULL
                  GROUP BY b.segment_id
                )
                UPDATE analytics_segments s
                SET
                  total_broadcasts = COALESCE(agg.total_broadcasts, 0),
                  total_delivered = COALESCE(agg.total_delivered, 0),
                  total_opened = COALESCE(agg.total_opened, 0),
                  total_clicked = COALESCE(agg.total_clicked, 0),
                  open_rate = CASE
                    WHEN COALESCE(agg.total_delivered, 0) = 0 THEN 0
                    ELSE ROUND((agg.total_opened::numeric / agg.total_delivered::numeric) * 100, 4)
                  END,
                  click_rate = CASE
                    WHEN COALESCE(agg.total_delivered, 0) = 0 THEN 0
                    ELSE ROUND((agg.total_clicked::numeric / agg.total_delivered::numeric) * 100, 4)
                  END,
                  synced_at = NOW()
                FROM agg
                WHERE s.id = agg.id
                """
            )
            cur.execute(
                """
                UPDATE analytics_segments
                SET
                  total_broadcasts = 0,
                  total_delivered = 0,
                  total_opened = 0,
                  total_clicked = 0,
                  open_rate = 0,
                  click_rate = 0,
                  synced_at = NOW()
                WHERE id NOT IN (SELECT DISTINCT segment_id FROM analytics_broadcasts WHERE segment_id IS NOT NULL)
                """
            )

            cur.execute(
                """
                UPDATE analytics_segments s
                SET total_contacts = sub.cnt, synced_at = NOW()
                FROM (
                    SELECT b.segment_id AS id,
                           COUNT(DISTINCT LOWER(r.email_address)) AS cnt
                    FROM analytics_broadcasts b
                    JOIN analytics_broadcast_recipients r ON r.broadcast_id = b.id
                    WHERE b.segment_id IS NOT NULL
                    GROUP BY b.segment_id
                ) sub
                WHERE s.id = sub.id
                """
            )

        conn.commit()

        return {
            "events_processed": len(events),
            "broadcasts_synced": len(broadcast_upserts),
            "segments_synced": len(segment_upserts),
            "contacts_synced": len(contact_rows),
            "recipients_synced": len(recipient_events),
            "last_processed_webhook_received_at": max_webhook_received_at,
        }
