#!/bin/bash
# Dump production database and restore into local PostgreSQL.
#
# Prerequisites:
#   brew services start postgresql@17
#
# Usage:
#   cd backend
#   bash scripts/dump_prod_to_local.sh

set -euo pipefail

PROD_URL="postgresql://postgres:AbakYHtBrESrJlCEkQaUscVKZrmPwGow@crossover.proxy.rlwy.net:34174/railway"
LOCAL_DB="maya_email_analytics"
DUMP_FILE="/tmp/maya_prod_dump.sql"

echo "============================================================"
echo "  Prod -> Local Database Sync"
echo "============================================================"
echo

# Check local postgres is running
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "ERROR: Local PostgreSQL is not running."
    echo "Start it with:  brew services start postgresql@17"
    exit 1
fi

if [ -f "$DUMP_FILE" ]; then
    echo "[1/4] Reusing existing dump at $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
    echo "  (Delete it to force a fresh dump)"
else
    echo "[1/4] Dumping production database..."
    pg_dump "$PROD_URL" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        --format=plain \
        > "$DUMP_FILE"
    echo "  Dump saved to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
fi

echo "[2/4] Creating local database (if needed)..."
createdb -h localhost -p 5432 "$LOCAL_DB" 2>/dev/null || true

echo "[3/4] Restoring into local database..."
psql -h localhost -p 5432 -d "$LOCAL_DB" < "$DUMP_FILE" 2>&1 | tail -5

echo "[4/4] Verifying..."
psql -h localhost -p 5432 -d "$LOCAL_DB" -c "
    SELECT
        (SELECT COUNT(*) FROM analytics_broadcasts) AS broadcasts,
        (SELECT COUNT(*) FROM analytics_contacts) AS contacts,
        (SELECT COUNT(*) FROM analytics_segments) AS segments,
        (SELECT COUNT(*) FROM analytics_broadcast_recipients) AS recipients;
"

echo
echo "============================================================"
echo "  Done! Local database: $LOCAL_DB"
echo "  Connection: postgresql://localhost:5432/$LOCAL_DB"
echo ""
echo "  Update .env to use local DB:"
echo "  DATABASE_PUBLIC_URL=postgresql://localhost:5432/$LOCAL_DB"
echo "============================================================"

rm -f "$DUMP_FILE"
