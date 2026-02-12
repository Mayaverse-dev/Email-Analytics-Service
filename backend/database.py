from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from config import settings


@contextmanager
def get_db() -> Iterator[psycopg.Connection]:
    if not settings.database_url:
        raise RuntimeError("DATABASE_PUBLIC_URL is not set")

    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    try:
        yield conn
    finally:
        conn.close()


def run_migrations() -> None:
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        return

    with get_db() as conn:
        with conn.cursor() as cur:
            for migration_file in migration_files:
                sql = migration_file.read_text(encoding="utf-8")
                cur.execute(sql)
        conn.commit()
