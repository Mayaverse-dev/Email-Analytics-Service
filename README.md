# Email Analytics Sync Logic

This service builds analytics from Resend webhook events stored in Postgres.

## What sync does

`POST /api/sync` runs `SyncService` and:

1. Fetches metadata from Resend:
   - Broadcasts
   - Contacts
   - Segments
2. Reads webhook events from `resend_wh_emails`.
3. Upserts recipient-level state into `analytics_broadcast_recipients`.
4. Recomputes aggregate metrics into:
   - `analytics_broadcasts`
   - `analytics_contacts`
   - `analytics_segments`
5. Writes run status to `analytics_sync_log`.do 

## Event filtering rules

Only events with a **broadcast context** are included:

- SQL filter: `broadcast_id IS NOT NULL`
- Validation: `broadcast_id` must be a valid UUID
- Validation: `email_id` must be present

So transactional events without `broadcast_id` are intentionally ignored.

## Idempotency model

Sync is safe to run multiple times:

- Recipient rows are keyed by `(broadcast_id, email_id)` and upserted.
- Aggregates are recomputed from recipient state each run (not incremented blindly).
- Late-arriving webhook events are picked up on the next sync.

## Metric definitions

Rates are based on delivered count:

- `open_rate = total_opened / total_delivered * 100`
- `click_rate = total_clicked / total_delivered * 100`

If `total_delivered = 0`, rate is `0`.

## Why rates can look wrong temporarily

If opens/clicks arrive before a delayed `email.delivered` webhook, a user/broadcast can show inflated rates until the next sync includes that delivery event.

## Useful endpoints

- `POST /api/sync` - trigger sync
- `GET /api/sync/status` - last sync status
- `GET /api/broadcasts` - broadcast metrics
- `GET /api/users` - user metrics
- `GET /api/segments` - segment metrics
