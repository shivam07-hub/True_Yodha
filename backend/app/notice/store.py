"""Notice record port. Postgres + memory — two adapters, real seam."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.notice.types import NoticeRecord


class NoticeStore(Protocol):
    def get(self, cause_key: str) -> NoticeRecord | None:
        ...

    def put(self, row: NoticeRecord) -> None:
        ...

    def list_all(self) -> tuple[NoticeRecord, ...]:
        ...

    def list_not_closed(self) -> tuple[NoticeRecord, ...]:
        ...

    def last_digest_fingerprint(self) -> str | None:
        """The open-set fingerprint of the last digest that was SENT."""
        ...

    def record_digest(self, fingerprint: str, at: datetime) -> None:
        ...

    def mark_closer_ran(self, at: datetime) -> None:
        """The closer executed, whether or not it sent a digest."""
        ...
