#!/usr/bin/env python3
"""
One-time script to import historical data from Kit (ConvertKit) into
the analytics database.

Usage:
    cd backend
    python scripts/import_kit.py          # Resume mode (skips existing contacts)
    python scripts/import_kit.py --fresh  # Fresh import (re-fetches everything)

This script is idempotent - safe to run multiple times.
Existing records will be updated, not duplicated.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db, run_migrations
from services.kit_sync_service import KitSyncService


def main() -> None:
    parser = argparse.ArgumentParser(description="Import data from Kit")
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Disable resume mode, re-fetch stats for all subscribers",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Kit Data Import")
    print("=" * 60)
    print()

    if args.fresh:
        print("Mode: FRESH (will re-fetch all data)")
    else:
        print("Mode: RESUME (will skip existing contacts)")
    print()

    print("Running migrations...")
    run_migrations()
    print("Migrations complete.")
    print()

    print("Starting Kit import...")
    print("-" * 60)

    service = KitSyncService(resume=not args.fresh)
    result = service.sync()

    print("-" * 60)
    print()
    print("Import Summary:")
    print(f"  Broadcasts imported: {result['broadcasts_imported']}")
    print(f"  Contacts imported:   {result['contacts_imported']}")
    print(f"  Segments imported:   {result['segments_imported']}")
    print()
    print("=" * 60)
    print("Import complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
