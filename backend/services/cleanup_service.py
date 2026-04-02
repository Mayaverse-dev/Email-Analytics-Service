from __future__ import annotations

from typing import Any

from database import get_db
from services.resend_client import ResendClient


class CleanupService:
    """Identifies bounced/suppressed/complained contacts and removes them from
    all segments + Resend, while preserving local analytics data."""

    def cleanup(self, dry_run: bool = False, batch_limit: int = 500) -> dict[str, Any]:
        candidates = self._find_bad_contacts()
        already_cleaned = self._get_already_cleaned()
        to_clean = [c for c in candidates if c["email"] not in already_cleaned]

        if batch_limit:
            to_clean = to_clean[:batch_limit]

        if dry_run:
            return {
                "dry_run": True,
                "total_candidates": len(candidates),
                "already_cleaned": len(already_cleaned),
                "to_clean": len(to_clean),
                "emails": [c["email"] for c in to_clean],
            }

        client = ResendClient()
        processed = 0
        total_segments_removed = 0
        resend_deletions = 0
        errors = 0

        try:
            for contact in to_clean:
                email = contact["email"]
                reason = contact["reason"]
                error_msg = None
                seg_count = 0
                deleted = False

                try:
                    seg_count = self._remove_local_memberships(email)
                    total_segments_removed += seg_count

                    result = client.delete_contact(email)
                    deleted = bool(result.get("deleted"))
                    if deleted:
                        resend_deletions += 1

                    self._mark_unsubscribed(email)

                except Exception as e:
                    error_msg = str(e)
                    errors += 1
                    print(f"WARNING: Cleanup failed for {email}: {e}")

                self._record_cleanup(email, reason, seg_count, deleted, error_msg)
                processed += 1

                if processed % 50 == 0:
                    print(f"  Processed {processed}/{len(to_clean)} contacts")
        finally:
            client.close()

        return {
            "dry_run": False,
            "total_candidates": len(candidates),
            "already_cleaned": len(already_cleaned),
            "processed": processed,
            "segments_removed": total_segments_removed,
            "resend_deletions": resend_deletions,
            "errors": errors,
        }

    def _find_bad_contacts(self) -> list[dict[str, str]]:
        """Find contacts with bounce/suppression/complaint events."""
        with get_db() as conn:
            with conn.cursor() as cur:
                # Union webhook events and analytics recipients for full coverage
                cur.execute("""
                    WITH bad_from_webhooks AS (
                        SELECT DISTINCT
                            LOWER(to_addresses[1]) AS email,
                            CASE
                                WHEN event_type = 'email.bounced' THEN 'bounced'
                                WHEN event_type = 'email.suppressed' THEN 'suppressed'
                                WHEN event_type = 'email.complained' THEN 'complained'
                            END AS reason
                        FROM resend_wh_emails
                        WHERE event_type IN ('email.bounced', 'email.suppressed', 'email.complained')
                          AND to_addresses IS NOT NULL
                          AND array_length(to_addresses, 1) > 0
                    ),
                    bad_from_recipients AS (
                        SELECT DISTINCT
                            LOWER(email_address) AS email,
                            CASE
                                WHEN bounced_at IS NOT NULL THEN 'bounced'
                                WHEN suppressed_at IS NOT NULL THEN 'suppressed'
                                WHEN complained_at IS NOT NULL THEN 'complained'
                            END AS reason
                        FROM analytics_broadcast_recipients
                        WHERE bounced_at IS NOT NULL
                           OR suppressed_at IS NOT NULL
                           OR complained_at IS NOT NULL
                    )
                    SELECT DISTINCT ON (email) email, reason
                    FROM (
                        SELECT email, reason FROM bad_from_webhooks
                        UNION ALL
                        SELECT email, reason FROM bad_from_recipients
                    ) combined
                    WHERE email IS NOT NULL AND email <> ''
                    ORDER BY email
                """)
                return cur.fetchall()

    def _get_already_cleaned(self) -> set[str]:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT email FROM cleaned_contacts")
                return {row["email"] for row in cur.fetchall()}

    def _remove_local_memberships(self, email: str) -> int:
        """Remove all segment memberships for this contact. Returns count removed."""
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM contact_segment_memberships WHERE contact_email = %s",
                    (email,),
                )
                count = cur.rowcount
            conn.commit()
        return count

    def _mark_unsubscribed(self, email: str) -> None:
        """Mark contact as unsubscribed in analytics (preserves the row)."""
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE analytics_contacts
                    SET unsubscribed = TRUE
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )
            conn.commit()

    def _record_cleanup(
        self,
        email: str,
        reason: str,
        segments_removed: int,
        deleted_from_resend: bool,
        error_message: str | None,
    ) -> None:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO cleaned_contacts
                        (email, reason, segments_removed, deleted_from_resend, error_message)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET
                        reason = EXCLUDED.reason,
                        cleaned_at = NOW(),
                        segments_removed = EXCLUDED.segments_removed,
                        deleted_from_resend = EXCLUDED.deleted_from_resend,
                        error_message = EXCLUDED.error_message
                    """,
                    (email, reason, segments_removed, deleted_from_resend, error_message),
                )
            conn.commit()
