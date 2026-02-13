from __future__ import annotations

from fastapi import APIRouter, HTTPException

from database import get_db
from services.sync_service import SyncService

router = APIRouter()


@router.post("/sync")
def trigger_sync() -> dict:
    try:
        result = SyncService().sync()
        return {"ok": True, "result": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Sync failed: {exc}") from exc


@router.get("/sync/status")
def get_sync_status() -> dict:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id,
                  started_at,
                  completed_at,
                  status,
                  events_processed,
                  last_processed_webhook_received_at,
                  error_message
                FROM analytics_sync_log
                ORDER BY started_at DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()

    if not row:
        return {"status": "never_synced"}
    return dict(row)


@router.post("/sync/clear")
def clear_synced_data() -> dict:
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    TRUNCATE TABLE
                      analytics_broadcast_recipients,
                      analytics_contacts,
                      analytics_segments,
                      analytics_broadcasts,
                      analytics_sync_log
                    RESTART IDENTITY
                    CASCADE
                    """
                )
            conn.commit()
        return {
            "ok": True,
            "message": "Cleared all synced analytics data. Source webhook tables were not modified.",
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to clear synced data: {exc}") from exc
