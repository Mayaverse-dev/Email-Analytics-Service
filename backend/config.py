from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_PUBLIC_URL", "").strip()
        self.db_pool_min_size = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
        self.db_pool_max_size = int(os.getenv("DB_POOL_MAX_SIZE", "5"))
        self.db_pool_timeout_seconds = float(os.getenv("DB_POOL_TIMEOUT_SECONDS", "5"))
        self.db_pool_max_lifetime_seconds = float(
            os.getenv("DB_POOL_MAX_LIFETIME_SECONDS", "1800")
        )
        self.resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
        self.resend_base_url = os.getenv("RESEND_BASE_URL", "https://api.resend.com").strip()
        self.request_timeout_seconds = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))
        self.frontend_dist_dir = Path(__file__).resolve().parents[1] / "frontend" / "dist"


settings = Settings()
