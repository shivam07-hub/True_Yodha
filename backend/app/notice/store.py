"""Notice record port. Postgres + memory — two adapters, real seam."""

from __future__ import annotations

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
