from __future__ import annotations

import time
from typing import Any

import httpx

from config import settings


class ResendClient:
    def __init__(self) -> None:
        if not settings.resend_api_key:
            raise RuntimeError("RESEND_API_KEY is not set")

        self._client = httpx.Client(
            base_url=settings.resend_base_url,
            timeout=settings.request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
        )
        self._last_request_at = 0.0

    def _throttle(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_request_at
        min_interval = 0.55
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._throttle()
        response = self._client.request(method, path, params=params)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Resend API error {response.status_code} for {path}: {response.text}"
            )
        data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError(f"Unexpected Resend response shape for {path}")
        return data

    def _list_paginated(self, path: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        after: str | None = None
        while True:
            params: dict[str, Any] = {"limit": 100}
            if after:
                params["after"] = after

            payload = self._request("GET", path, params=params)
            page_data = payload.get("data", [])
            if not isinstance(page_data, list):
                raise RuntimeError(f"Unexpected list payload for {path}")
            items.extend(page_data)

            has_more = bool(payload.get("has_more"))
            if not has_more or not page_data:
                break
            after = str(page_data[-1]["id"])
        return items

    def list_broadcasts(self) -> list[dict[str, Any]]:
        return self._list_paginated("/broadcasts")

    def get_broadcast(self, broadcast_id: str) -> dict[str, Any]:
        payload = self._request("GET", f"/broadcasts/{broadcast_id}")
        data = payload.get("data", payload)
        if not isinstance(data, dict):
            raise RuntimeError(f"Unexpected broadcast payload for {broadcast_id}")
        return data

    def list_segments(self) -> list[dict[str, Any]]:
        return self._list_paginated("/segments")

    def list_contacts(self) -> list[dict[str, Any]]:
        return self._list_paginated("/contacts")

    def list_contacts_for_segment(self, segment_id: str) -> list[dict[str, Any]]:
        try:
            return self._list_paginated(f"/contacts/{segment_id}")
        except RuntimeError:
            items: list[dict[str, Any]] = []
            after: str | None = None
            while True:
                params: dict[str, Any] = {"limit": 100, "segment_id": segment_id}
                if after:
                    params["after"] = after

                payload = self._request("GET", "/contacts", params=params)
                page_data = payload.get("data", [])
                if not isinstance(page_data, list):
                    raise RuntimeError("Unexpected list payload for /contacts")
                items.extend(page_data)

                has_more = bool(payload.get("has_more"))
                if not has_more or not page_data:
                    break
                after = str(page_data[-1]["id"])
            return items

    def close(self) -> None:
        self._client.close()
