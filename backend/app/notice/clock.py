"""Clock port — two adapters (system + frozen) so reopen ordering is testable."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class FrozenClock:
    def __init__(self, at: datetime) -> None:
        self._at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)

    def now(self) -> datetime:
        return self._at
