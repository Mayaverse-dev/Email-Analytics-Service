from __future__ import annotations

import time
from typing import Any

import httpx

from config import settings


class KitClient:
    def __init__(self) -> None:
        if not settings.kit_api_key:
            raise RuntimeError("KIT_API_KEY is not set")

        self._client = httpx.Client(
            base_url=settings.kit_base_url,
            timeout=60.0,
            headers={
                "X-Kit-Api-Key": settings.kit_api_key,
                "Content-Type": "application/json",
            },
        )
        self._last_request_at = 0.0

    def _throttle(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_request_at
        min_interval = 0.2
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        retries: int = 3,
    ) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(retries):
            self._throttle()
            try:
                response = self._client.request(method, path, params=params)
                if response.status_code >= 400:
                    raise RuntimeError(
                        f"Kit API error {response.status_code} for {path}: {response.text}"
                    )
                data = response.json()
                if not isinstance(data, dict):
                    raise RuntimeError(f"Unexpected Kit response shape for {path}")
                return data
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_error = e
                wait_time = 2 ** attempt
                print(f"  Request to {path} timed out, retrying in {wait_time}s...")
                time.sleep(wait_time)
        raise RuntimeError(f"Kit API request failed after {retries} retries: {last_error}")

    def _list_paginated(
        self,
        path: str,
        key: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        after: str | None = None
        base_params = params or {}

        while True:
            req_params: dict[str, Any] = {**base_params, "per_page": 500}
            if after:
                req_params["after"] = after

            payload = self._request("GET", path, req_params)
            page_data = payload.get(key, [])
            if not isinstance(page_data, list):
                raise RuntimeError(f"Unexpected list payload for {path}")
            items.extend(page_data)

            pagination = payload.get("pagination", {})
            has_next = bool(pagination.get("has_next_page"))
            if not has_next or not page_data:
                break
            after = pagination.get("end_cursor")
            if not after:
                break

        return items

    def list_broadcasts(self) -> list[dict[str, Any]]:
        return self._list_paginated("/v4/broadcasts", "broadcasts")

    def get_broadcast_stats(self, broadcast_id: int) -> dict[str, Any]:
        payload = self._request("GET", f"/v4/broadcasts/{broadcast_id}/stats")
        broadcast = payload.get("broadcast", {})
        return broadcast.get("stats", {})

    def list_subscribers(self, status: str = "all") -> list[dict[str, Any]]:
        return self._list_paginated(
            "/v4/subscribers", "subscribers", params={"status": status}
        )

    def get_subscriber_stats(self, subscriber_id: int) -> dict[str, Any]:
        try:
            payload = self._request("GET", f"/v4/subscribers/{subscriber_id}/stats")
            subscriber = payload.get("subscriber", {})
            return subscriber.get("stats", {})
        except Exception:
            return {}

    def list_tags(self) -> list[dict[str, Any]]:
        return self._list_paginated("/v4/tags", "tags")

    def list_subscribers_for_tag(self, tag_id: int) -> list[dict[str, Any]]:
        return self._list_paginated(
            f"/v4/tags/{tag_id}/subscribers",
            "subscribers",
            params={"status": "all"},
        )

    def close(self) -> None:
        self._client.close()
