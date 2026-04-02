# Backend - FastAPI

## Architecture

FastAPI app with asyncpg connection pool. All routers (except webhooks) have global `verify_maya_auth` dependency. Frontend static files served from `../frontend/dist` with SPA fallback.

## Routers

| Router | Prefix | Key Endpoints |
|--------|--------|--------------|
| sync | /api/sync | POST sync, GET status, POST clear |
| dashboard | /api/dashboard | GET parent-folders (cached, with metric snapshots) |
| broadcasts | /api/broadcasts | GET list (paginated, searchable), GET detail, GET recipients |
| users | /api/users | GET list (slot-based segment filtering, sorting), GET detail |
| segments | /api/segments | GET list, GET detail, PUT name, PUT folder |
| segment_folders | /api/segment-folders | GET folder tree with counts |
| contacts | /api/contacts | CRUD contacts, segment membership, bulk add, CSV import |
| webhooks | /api/webhooks | POST framer-email (token-validated, no auth) |

## Services

- **ResendClient**: HTTP wrapper for Resend API with 0.55s throttle, 5 retries
- **KitClient**: HTTP wrapper for Kit API with 0.2s throttle, 3 retries
- **SyncService**: Core sync logic - fetches from Resend, processes webhooks, upserts analytics, captures snapshots, pushes memberships
- **KitSyncService**: One-time Kit data import into analytics tables

## Database

13 migrations in `migrations/`. Key tables:
- `analytics_broadcasts` - Broadcast metadata + aggregated stats
- `analytics_broadcast_recipients` - Per-recipient event tracking (sent/delivered/opened/clicked/bounced)
- `analytics_contacts` - Deduplicated contacts with engagement metrics
- `analytics_segments` - Segments with folder assignment and stats
- `analytics_segment_folders` - Hierarchical folder tree (parent_id)
- `contact_segment_memberships` - Junction table (source of truth for membership)
- `analytics_sync_log` - Sync job history
- `analytics_*_snapshots` - Historical data for charts (broadcast, segment, folder, dashboard)
- `resend_wh_emails` - Raw webhook events from Resend
- `kit_*` - Raw Kit API data tables

## Config (.env)

DATABASE_PUBLIC_URL, RESEND_API_KEY, KIT_API_KEY, SHARED_JWT_SECRET, WEBHOOK_SECRET, PORTAL_URL, REQUEST_TIMEOUT_SECONDS, DB_POOL_MIN/MAX_SIZE

## Patterns

- asyncpg with `pool.acquire()` context manager for queries
- Cache: simple dict with `cache.get/set/invalidate_all()`
- Rates: `total_X / total_delivered * 100` (0 if no deliveries)
- Contact dedup: keeps "best" record by delivery/open/click counts
- Webhook auth: validates `WEBHOOK_SECRET` (falls back to `SHARED_JWT_SECRET`)
- Segment membership synced_to_resend flag tracks push status
