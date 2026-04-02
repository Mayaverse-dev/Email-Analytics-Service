from __future__ import annotations

from fastapi import APIRouter

from cache import cache
from database import get_db
from services.cleanup_service import CleanupService

router = APIRouter()


@router.post("/cleanup")
def trigger_cleanup(dry_run: bool = False, batch_limit: int = 500) -> dict:
    """Run contact cleanup. Set dry_run=True to preview without changes."""
    result = CleanupService().cleanup(dry_run=dry_run, batch_limit=batch_limit)
    if not dry_run:
        cache.invalidate_all()
    return {"ok": True, "result": result}


@router.get("/cleanup/status")
def get_cleanup_status() -> dict:
    """Return recent cleanup history."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) AS total_cleaned,
                    MAX(cleaned_at) AS last_cleanup_at,
                    COUNT(*) FILTER (WHERE error_message IS NOT NULL) AS total_errors
                FROM cleaned_contacts
            """)
            summary = cur.fetchone()

            cur.execute("""
                SELECT email, reason, cleaned_at, segments_removed,
                       deleted_from_resend, error_message
                FROM cleaned_contacts
                ORDER BY cleaned_at DESC
                LIMIT 20
            """)
            recent = cur.fetchall()

    return {"summary": dict(summary), "recent": [dict(r) for r in recent]}
