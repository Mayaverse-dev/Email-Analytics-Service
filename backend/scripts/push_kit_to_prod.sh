#!/bin/bash
# Push local Kit raw tables to production database.
#
# This dumps only kit_* tables from local and restores them to prod.
# Safe to run multiple times - uses --clean to drop and recreate.
#
# Usage:
#   cd backend
#   bash scripts/push_kit_to_prod.sh

set -euo pipefail

LOCAL_DB="maya_email_analytics"
PROD_URL="postgresql://postgres:AbakYHtBrESrJlCEkQaUscVKZrmPwGow@crossover.proxy.rlwy.net:34174/railway"
DUMP_FILE="/tmp/kit_raw_dump.sql"

echo "============================================================"
echo "  Push Kit Raw Tables: Local -> Production"
echo "============================================================"
echo

echo "[1/3] Dumping Kit tables from local DB..."
pg_dump -h localhost -p 5432 -d "$LOCAL_DB" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --format=plain \
    -t kit_broadcasts \
    -t kit_broadcast_stats \
    -t kit_subscribers \
    -t kit_subscriber_stats \
    -t kit_tags \
    -t kit_tag_subscribers \
    > "$DUMP_FILE"
echo "  Dump saved to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

echo "[2/3] Restoring Kit tables to production..."
psql "$PROD_URL" < "$DUMP_FILE" 2>&1 | tail -5

echo "[3/3] Verifying production..."
psql "$PROD_URL" -c "
    SELECT 'kit_broadcasts' AS tbl, COUNT(*) AS rows FROM kit_broadcasts
    UNION ALL SELECT 'kit_broadcast_stats', COUNT(*) FROM kit_broadcast_stats
    UNION ALL SELECT 'kit_subscribers', COUNT(*) FROM kit_subscribers
    UNION ALL SELECT 'kit_subscriber_stats', COUNT(*) FROM kit_subscriber_stats
    UNION ALL SELECT 'kit_tags', COUNT(*) FROM kit_tags
    UNION ALL SELECT 'kit_tag_subscribers', COUNT(*) FROM kit_tag_subscribers;
"

rm -f "$DUMP_FILE"

echo
echo "============================================================"
echo "  Done! Kit raw tables pushed to production."
echo "  Now run rebuild_all_analytics.py against prod to rebuild."
echo "============================================================"
