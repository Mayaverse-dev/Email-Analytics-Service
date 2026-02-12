from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_PUBLIC_URL", "").strip()
        self.resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
        self.resend_base_url = os.getenv("RESEND_BASE_URL", "https://api.resend.com").strip()
        self.request_timeout_seconds = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))
        self.frontend_dist_dir = Path(__file__).resolve().parents[1] / "frontend" / "dist"


settings = Settings()
