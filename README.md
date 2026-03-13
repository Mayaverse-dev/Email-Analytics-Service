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

# Import contacts from Excel to Resend segment (creates segment if needed)
python scripts/import_segment.py --file "path/to/emails.xlsx" --segment-name "Segment Name"
```

## Adding a New Segment

Standard procedure for importing contacts into a new segment:

1. **Prepare Excel file**
   - Must have a column with emails (auto-detected if named "email", "Email", etc.)
   - Optional: first_name, last_name columns

2. **Run import script**
   ```bash
   cd backend
   python scripts/import_segment.py \
       --file "../Exports all emails/MyEmails.xlsx" \
       --segment-name "My New Segment"
   ```
   
   The script will automatically create the segment in Resend if it doesn't exist.

3. **Move segment to folder (optional)**
   - New segments appear in "To Be Tagged" folder
   - Use the UI dropdown to move to the appropriate folder

The script is idempotent and supports resume - if interrupted, re-run the same command to continue.

### Batch Import

To import all Excel files from a folder as separate segments:

```bash
cd backend
python scripts/batch_import_segments.py --folder "../Exports all emails" --dry-run  # Preview
python scripts/batch_import_segments.py --folder "../Exports all emails"            # Run
```

## Sync

`POST /api/sync` runs the Resend sync:

1. Fetches broadcast metadata, contacts, and segments from Resend API
2. Reads webhook events from `resend_wh_emails` (only events with valid `broadcast_id`)
3. Upserts recipient-level state into `analytics_broadcast_recipients`
4. Inserts broadcast-derived segment memberships into `contact_segment_memberships`
5. Recomputes aggregates for broadcasts, contacts, and segments
6. Appends time-series snapshots
7. Pushes any unsynced segment memberships to Resend (rate limited at 2 req/sec)
8. Writes run status to `analytics_sync_log`

Sync is idempotent - safe to run multiple times.

## Segment Membership

Segment membership is managed via the `contact_segment_memberships` junction table (source of truth). This DB owns segment membership; Resend is kept in sync.

- Memberships added via API are marked `synced_to_resend = FALSE`
- On sync, pending memberships are pushed to Resend
- Broadcast-derived memberships are auto-marked as synced

## Authentication

All API endpoints require authentication via one of:

- **Cookie** (browser): `maya_auth_token` cookie set by Maya Dashboard portal
- **Bearer JWT** (service-to-service): `Authorization: Bearer <token>` header

JWTs are signed with `SHARED_JWT_SECRET` (HS256). To generate a token for a service:

```python
import jwt
token = jwt.encode({"sub": "my-service"}, "your-shared-jwt-secret", algorithm="HS256")
```

Then call APIs with:

```bash
curl -H "Authorization: Bearer <token>" https://your-domain/api/segments
```

## Metric Definitions

- `open_rate = total_opened / total_delivered * 100`
- `click_rate = total_clicked / total_delivered * 100`
- If `total_delivered = 0`, rate is `0`

## API Endpoints

### Dashboard APIs (used by the frontend)

- `POST /api/sync` - trigger Resend sync + push pending memberships
- `GET /api/sync/status` - last sync status
- `GET /api/broadcasts` - broadcast list (sent/completed only)
- `GET /api/broadcasts/{id}` - broadcast detail with content
- `GET /api/users` - contacts with sorting and segment filtering
- `GET /api/users/{email}` - contact detail with broadcast history
- `GET /api/segments` - segments with folder_id
- `GET /api/segments/{id}` - segment detail with members
- `GET /api/segment-folders` - folder tree with contact counts
- `PUT /api/segments/{id}/folder` - move segment to folder

### Service APIs (for external services to manage contacts and segments)

- `GET /api/contacts/{email}/segments` - list segments for a contact
- `POST /api/contacts` - create a contact
- `PUT /api/contacts/{email}` - update contact details
- `POST /api/contacts/{email}/segments/{segment_id}` - add contact to segment
- `DELETE /api/contacts/{email}/segments/{segment_id}` - remove contact from segment
- `GET /api/segments` - list all segments
- `GET /api/segments/{id}/contacts` - list contacts in a segment
- `POST /api/segments` - create a new segment
- `POST /api/segments/{id}/contacts` - bulk add contacts to segment
