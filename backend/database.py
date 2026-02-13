from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from config import settings

_db_pool: ConnectionPool | None = None


def init_db_pool() -> None:
    global _db_pool
    if _db_pool is not None:
        return
    if not settings.database_url:
        raise RuntimeError("DATABASE_PUBLIC_URL is not set")

    _db_pool = ConnectionPool(
        conninfo=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        timeout=settings.db_pool_timeout_seconds,
        max_lifetime=settings.db_pool_max_lifetime_seconds,
        kwargs={"row_factory": dict_row},
        open=True,
    )


def close_db_pool() -> None:
    global _db_pool
    if _db_pool is not None:
        _db_pool.close()
        _db_pool = None


@contextmanager
def get_db() -> Iterator[psycopg.Connection]:
    if not settings.database_url:
        raise RuntimeError("DATABASE_PUBLIC_URL is not set")

    if _db_pool is None:
        conn = psycopg.connect(settings.database_url, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()
        return

    with _db_pool.connection() as conn:
        yield conn


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
