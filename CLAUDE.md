# Maya Email Analytics Service

Internal dashboard for tracking email marketing performance. Syncs data from Resend (active) and Kit/ConvertKit (historical) into a local PostgreSQL analytics database with a React frontend.

## Project Structure

```
├── backend/          # FastAPI Python backend
│   ├── main.py       # App entry, routers, static file serving
│   ├── auth.py       # JWT auth (cookie or Bearer token)
│   ├── config.py     # Env vars from .env
│   ├── cache.py      # Simple in-memory cache
│   ├── database.py   # asyncpg connection pool + migration runner
│   ├── routers/      # API route handlers
│   ├── services/     # Resend/Kit API clients, sync logic
│   ├── migrations/   # Sequential SQL migrations (001-013)
│   └── scripts/      # Import, export, rebuild scripts (gitignored)
├── frontend/         # React + Vite + Tailwind SPA
│   └── src/
│       ├── api/client.js       # fetch wrapper, all API functions
│       ├── context/ThemeContext.jsx  # light/dark mode
│       ├── components/         # Layout, MetricCard
│       ├── pages/              # Dashboard, Broadcasts, Users, Segments
│       └── utils/format.js     # Number/date formatting
├── Email Lists/      # Excel/CSV source files (gitignored)
├── railway.json      # Railway deployment config
└── nixpacks.toml     # Build: Python 3.12 + Node 20
```

## Tech Stack

- **Backend**: FastAPI, asyncpg (PostgreSQL), httpx, PyJWT, uvicorn
- **Frontend**: React 18, React Router 6, Tailwind CSS 3, Vite 5, Lucide icons
- **Database**: PostgreSQL (Railway-hosted in prod, local brew in dev)
- **Deployment**: Railway (Nixpacks builder)
- **External APIs**: Resend (email sending/analytics), Kit (historical data)

## Local Development

```bash
brew services start postgresql@17
source .venv/bin/activate
# Terminal 1: cd backend && uvicorn main:app --reload --port 8000
# Terminal 2: cd frontend && npm run dev
```

- Frontend: http://localhost:5173 (proxies /api to :8000)
- Backend: http://localhost:8000/api

## Authentication

All API endpoints (except webhooks) require auth via:
- Cookie: `maya_auth_token` (browser sessions from Maya Dashboard portal)
- Bearer JWT: `Authorization: Bearer <token>` (service-to-service)
- JWTs signed with `SHARED_JWT_SECRET` (HS256)
- Dev mode: if no secret configured, auth is bypassed

## Key Data Flow

1. `POST /api/sync` triggers full Resend sync
2. Fetches broadcasts, segments, contacts from Resend API
3. Processes webhook events from `resend_wh_emails` table
4. Upserts analytics tables, computes aggregates and rates
5. Captures historical snapshots for dashboard charts
6. Pushes unsynced segment memberships back to Resend

## Deployment

Railway auto-deploys from git. Build: `cd frontend && npm ci && npm run build`. Start: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`. Frontend dist is served as static files by FastAPI with SPA fallback to index.html.

## Conventions

- UUIDs for broadcast/segment IDs, text IDs for contacts
- Rates stored as percentages (0-100), computed as `total_X / total_delivered * 100`
- Segment membership source of truth is `contact_segment_memberships` table
- In-memory cache with manual invalidation on writes
- Migrations auto-run on startup
- Scripts directory is gitignored (contains import/rebuild utilities)
