# Maya Email Analytics Service

Internal dashboard for tracking email marketing performance across Resend (active) and Kit (historical).

## Local Development

```bash
# 1. Start local PostgreSQL
brew services start postgresql@17

# 2. Activate virtualenv
source .venv/bin/activate

# 3. Start backend (terminal 1)
cd backend
uvicorn main:app --reload --port 8000

# 4. Start frontend (terminal 2)
cd frontend
npm run dev
```

Frontend: http://localhost:5173
Backend API: http://localhost:8000/api

## Scripts

```bash
cd backend

# Import Kit API data into raw tables (one-time, slow)
python scripts/import_kit_raw.py

# Rebuild all analytics from raw data (Kit + Resend)
python scripts/rebuild_all_analytics.py

# Dump production DB to local
bash scripts/dump_prod_to_local.sh

# Seed segment folder structure
python scripts/seed_segment_folders.py
```

## Sync

`POST /api/sync` runs the Resend sync:

1. Fetches broadcast metadata, contacts, and segments from Resend API
2. Reads webhook events from `resend_wh_emails` (only events with valid `broadcast_id`)
3. Upserts recipient-level state into `analytics_broadcast_recipients`
4. Recomputes aggregates for broadcasts, contacts, and segments
5. Appends time-series snapshots
6. Writes run status to `analytics_sync_log`

Sync is idempotent - safe to run multiple times.

## Metric Definitions

- `open_rate = total_opened / total_delivered * 100`
- `click_rate = total_clicked / total_delivered * 100`
- If `total_delivered = 0`, rate is `0`

## API Endpoints

- `POST /api/sync` - trigger Resend sync
- `GET /api/sync/status` - last sync status
- `GET /api/broadcasts` - broadcast list (sent/completed only)
- `GET /api/broadcasts/{id}` - broadcast detail with content
- `GET /api/users` - contacts with sorting and segment filtering
- `GET /api/segments` - segments with folder_id
- `GET /api/segment-folders` - folder tree with contact counts
- `PUT /api/segments/{id}/folder` - move segment to folder
