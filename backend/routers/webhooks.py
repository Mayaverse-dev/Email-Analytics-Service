from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from cache import cache
from config import settings
from database import get_db

router = APIRouter()

FRAMER_SEGMENT_ID = "7a4912b3-8740-4b0e-b7f1-8cddc59fb310"


class FramerEmailPayload(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


@router.post("/webhooks/framer-email")
def framer_email_webhook(
    body: FramerEmailPayload,
    token: str = Query(...),
) -> dict:
    if not settings.webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    if not secrets.compare_digest(token, settings.webhook_secret):
        raise HTTPException(status_code=403, detail="Invalid token")

    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analytics_contacts (id, email, first_name, last_name, source)
                VALUES (gen_random_uuid()::text, %s, %s, %s, 'resend')
                ON CONFLICT (email, source) DO UPDATE SET
                    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), analytics_contacts.first_name),
                    last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), analytics_contacts.last_name)
                """,
                (email, body.first_name, body.last_name),
            )

            cur.execute(
                """
                INSERT INTO contact_segment_memberships
                    (contact_email, segment_id, source, synced_to_resend)
                VALUES (%s, %s, 'api', FALSE)
                ON CONFLICT (contact_email, segment_id) DO NOTHING
                """,
                (email, FRAMER_SEGMENT_ID),
            )

        conn.commit()

    cache.invalidate_all()
    return {"ok": True, "email": email}
