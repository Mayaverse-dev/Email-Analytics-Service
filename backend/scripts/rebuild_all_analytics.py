#!/usr/bin/env python3
"""
Master rebuild script: clears all analytics tables, then rebuilds
from raw data sources (Kit raw tables + Resend webhook tables).

Usage:
    cd backend
    python scripts/rebuild_all_analytics.py

This will:
1. Clear all analytics_* data tables (preserves segment_folders)
2. Rebuild Kit analytics from kit_* raw tables
3. Run Resend sync from resend_wh_* tables
4. Re-apply segment folder assignments
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations
from scripts.rebuild_kit_analytics import rebuild as rebuild_kit
from services.sync_service import SyncService


def clear_analytics() -> None:
    print("Clearing analytics tables...")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM analytics_broadcast_snapshots")
            cur.execute("DELETE FROM analytics_segment_snapshots")
            cur.execute("DELETE FROM analytics_broadcast_recipients")
            cur.execute("DELETE FROM analytics_broadcasts")
            cur.execute("DELETE FROM analytics_contacts")
            cur.execute("UPDATE analytics_segments SET folder_id = NULL")
            cur.execute("DELETE FROM analytics_segments")
            cur.execute("DELETE FROM analytics_sync_log")
        conn.commit()
    print("  Cleared all analytics data (folders preserved)")


def run_resend_sync() -> None:
    print("Running Resend sync from webhook tables...")
    service = SyncService()
    result = service.sync()
    print(f"  Events processed: {result['events_processed']}")
    print(f"  Broadcasts synced: {result['broadcasts_synced']}")
    print(f"  Contacts synced: {result['contacts_synced']}")
    print(f"  Segments synced: {result['segments_synced']}")


def reapply_folder_assignments() -> None:
    print("Re-applying segment folder assignments...")
    from scripts.seed_segment_folders import main as seed_folders
    seed_folders()


def main() -> None:
    print("=" * 60)
    print("Full Analytics Rebuild")
    print("=" * 60)
    print()

    print("Running migrations...")
    run_migrations()
    print()

    clear_analytics()
    print()

    print("-" * 60)
    print("Phase 1: Kit data (from raw tables)")
    print("-" * 60)
    rebuild_kit()
    print()

    print("-" * 60)
    print("Phase 2: Resend data (from webhook tables)")
    print("-" * 60)
    run_resend_sync()
    print()

    print("-" * 60)
    print("Phase 3: Folder assignments")
    print("-" * 60)
    reapply_folder_assignments()
    print()

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM analytics_broadcasts")
            bc = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM analytics_contacts")
            cc = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM analytics_segments")
            sc = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) AS c FROM analytics_broadcast_recipients")
            rc = cur.fetchone()["c"]

    print("=" * 60)
    print("Rebuild complete!")
    print(f"  Broadcasts:  {bc}")
    print(f"  Contacts:    {cc}")
    print(f"  Segments:    {sc}")
    print(f"  Recipients:  {rc}")
    print("=" * 60)


if __name__ == "__main__":
    main()
