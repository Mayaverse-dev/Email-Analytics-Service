from __future__ import annotations

import threading
from typing import Any


class _Cache:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        return self._store.get(key)

    def set(self, key: str, value: Any) -> None:
        self._store[key] = value

    def invalidate_all(self) -> None:
        with self._lock:
            self._store.clear()


cache = _Cache()
