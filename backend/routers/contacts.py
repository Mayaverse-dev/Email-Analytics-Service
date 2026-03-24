from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cache import cache
from database import get_db

router = APIRouter()


class CreateContactRequest(BaseModel):
    email: str
    first_name: str | None = None
    last_name: str | None = None


class BulkAddContactsRequest(BaseModel):
    emails: list[str]


class CreateSegmentRequest(BaseModel):
    name: str


class ImportContact(BaseModel):
    email: str
    first_name: str | None = None
    last_name: str | None = None


class ImportCsvRequest(BaseModel):
    segment_id: str | None = None
    new_segment_name: str | None = None
    contacts: list[ImportContact]


@router.post("/contacts")
def create_contact(body: CreateContactRequest) -> dict:
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analytics_contacts (id, email, first_name, last_name, source)
                VALUES (gen_random_uuid()::text, %s, %s, %s, 'resend')
                ON CONFLICT (email, source) DO UPDATE SET
                    first_name = COALESCE(EXCLUDED.first_name, analytics_contacts.first_name),
                    last_name = COALESCE(EXCLUDED.last_name, analytics_contacts.last_name)
                RETURNING id, email
                """,
                (email, body.first_name, body.last_name),
            )
            row = cur.fetchone()
        conn.commit()

    cache.invalidate_all()
    return {"ok": True, "contact": dict(row)}


@router.put("/contacts/{email}")
def update_contact(email: str, body: CreateContactRequest) -> dict:
    normalized = email.strip().lower()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE analytics_contacts
                SET first_name = COALESCE(%s, first_name),
                    last_name = COALESCE(%s, last_name)
                WHERE LOWER(email) = %s AND source = 'resend'
                """,
                (body.first_name, body.last_name, normalized),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Contact not found")
        conn.commit()

    cache.invalidate_all()
    return {"ok": True}


@router.get("/contacts/{email}/segments")
def list_contact_segments(email: str) -> dict:
    normalized = email.strip().lower()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, s.name, m.source, m.added_at
                FROM contact_segment_memberships m
                JOIN analytics_segments s ON s.id = m.segment_id
                WHERE m.contact_email = %s
                ORDER BY s.name
                """,
                (normalized,),
            )
            segments = cur.fetchall()

    return {"email": normalized, "segments": segments}


@router.get("/segments/{segment_id}/contacts")
def list_segment_contacts(
    segment_id: UUID,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM analytics_segments WHERE id = %s",
                (segment_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Segment not found")

            cur.execute(
                """
                SELECT m.contact_email AS email, m.source, m.added_at,
                       c.first_name, c.last_name
                FROM contact_segment_memberships m
                LEFT JOIN analytics_contacts c ON LOWER(c.email) = m.contact_email
                WHERE m.segment_id = %s
                ORDER BY m.contact_email
                LIMIT %s OFFSET %s
                """,
                (segment_id, limit, offset),
            )
            contacts = cur.fetchall()

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM contact_segment_memberships WHERE segment_id = %s",
                (segment_id,),
            )
            total = cur.fetchone()["cnt"]

    return {"segment_id": str(segment_id), "contacts": contacts, "total": total}


@router.post("/contacts/{email}/segments/{segment_id}")
def add_contact_to_segment(email: str, segment_id: UUID) -> dict:
    normalized = email.strip().lower()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM analytics_segments WHERE id = %s",
                (segment_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Segment not found")

            cur.execute(
                """
                INSERT INTO contact_segment_memberships
                    (contact_email, segment_id, source, synced_to_resend)
                VALUES (%s, %s, 'api', FALSE)
                ON CONFLICT (contact_email, segment_id) DO NOTHING
                """,
                (normalized, segment_id),
            )
        conn.commit()

    cache.invalidate_all()
    return {"ok": True}


@router.delete("/contacts/{email}/segments/{segment_id}")
def remove_contact_from_segment(email: str, segment_id: UUID) -> dict:
    normalized = email.strip().lower()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM contact_segment_memberships
                WHERE contact_email = %s AND segment_id = %s
                """,
                (normalized, segment_id),
            )
        conn.commit()

    cache.invalidate_all()
    return {"ok": True}


@router.post("/segments")
def create_segment(body: CreateSegmentRequest) -> dict:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM analytics_segment_folders
                WHERE name = 'To Be Tagged' AND parent_id IS NULL
                """
            )
            tbt_row = cur.fetchone()
            folder_id = tbt_row["id"] if tbt_row else None

            cur.execute(
                """
                INSERT INTO analytics_segments (id, name, display_name, source, folder_id, created_at)
                VALUES (gen_random_uuid(), %s, %s, 'resend', %s, NOW())
                RETURNING id, name, display_name
                """,
                (body.name.strip(), body.name.strip(), folder_id),
            )
            row = cur.fetchone()
        conn.commit()

    cache.invalidate_all()
    return {"ok": True, "segment": dict(row)}


@router.post("/segments/{segment_id}/contacts")
def bulk_add_contacts_to_segment(segment_id: UUID, body: BulkAddContactsRequest) -> dict:
    if not body.emails:
        raise HTTPException(status_code=400, detail="No emails provided")

    emails = [e.strip().lower() for e in body.emails if e.strip()]

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM analytics_segments WHERE id = %s",
                (segment_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Segment not found")

            cur.execute(
                """
                INSERT INTO contact_segment_memberships
                    (contact_email, segment_id, source, synced_to_resend)
                SELECT LOWER(unnest(%s::text[])), %s, 'api', FALSE
                ON CONFLICT (contact_email, segment_id) DO NOTHING
                """,
                (emails, segment_id),
            )
            added = cur.rowcount
        conn.commit()

    cache.invalidate_all()
    return {"ok": True, "added": added}


@router.post("/segments/import")
def import_csv_to_segment(body: ImportCsvRequest) -> dict:
    has_id = body.segment_id and body.segment_id.strip()
    has_name = body.new_segment_name and body.new_segment_name.strip()

    if not has_id and not has_name:
        raise HTTPException(
            status_code=400,
            detail="Provide either segment_id or new_segment_name",
        )
    if has_id and has_name:
        raise HTTPException(
            status_code=400,
            detail="Provide segment_id or new_segment_name, not both",
        )
    if not body.contacts:
        raise HTTPException(status_code=400, detail="No contacts provided")

    valid = [
        (c.email.strip().lower(), c.first_name, c.last_name)
        for c in body.contacts
        if c.email and c.email.strip() and "@" in c.email.strip()
    ]
    if not valid:
        raise HTTPException(status_code=400, detail="No valid email addresses found")

    emails = [v[0] for v in valid]
    first_names = [v[1] for v in valid]
    last_names = [v[2] for v in valid]

    with get_db() as conn:
        with conn.cursor() as cur:
            if has_name:
                cur.execute(
                    """
                    SELECT id FROM analytics_segment_folders
                    WHERE name = 'To Be Tagged' AND parent_id IS NULL
                    """
                )
                tbt_row = cur.fetchone()
                folder_id = tbt_row["id"] if tbt_row else None

                cur.execute(
                    """
                    INSERT INTO analytics_segments
                        (id, name, display_name, source, folder_id, created_at)
                    VALUES (gen_random_uuid(), %s, %s, 'resend', %s, NOW())
                    RETURNING id, name, display_name
                    """,
                    (body.new_segment_name.strip(), body.new_segment_name.strip(), folder_id),
                )
                seg_row = cur.fetchone()
                segment_id = str(seg_row["id"])
                segment_name = seg_row["display_name"]
            else:
                segment_id = body.segment_id.strip()
                cur.execute(
                    "SELECT id, COALESCE(display_name, name) AS label FROM analytics_segments WHERE id = %s",
                    (segment_id,),
                )
                seg_row = cur.fetchone()
                if not seg_row:
                    raise HTTPException(status_code=404, detail="Segment not found")
                segment_name = seg_row["label"]

            cur.execute(
                """
                INSERT INTO analytics_contacts (id, email, first_name, last_name, source)
                SELECT gen_random_uuid()::text, e, fn, ln, 'resend'
                FROM unnest(%s::text[], %s::text[], %s::text[]) AS t(e, fn, ln)
                ON CONFLICT (email, source) DO UPDATE SET
                    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), analytics_contacts.first_name),
                    last_name  = COALESCE(NULLIF(EXCLUDED.last_name, ''), analytics_contacts.last_name)
                """,
                (emails, first_names, last_names),
            )

            cur.execute(
                """
                INSERT INTO contact_segment_memberships
                    (contact_email, segment_id, source, synced_to_resend)
                SELECT LOWER(unnest(%s::text[])), %s, 'import', FALSE
                ON CONFLICT (contact_email, segment_id) DO NOTHING
                """,
                (emails, segment_id),
            )
            added = cur.rowcount

        conn.commit()

    cache.invalidate_all()
    return {
        "ok": True,
        "segment_id": segment_id,
        "segment_name": segment_name,
        "added": added,
        "skipped": len(emails) - added,
    }
