"""In-memory Notice record — the test adapter."""

from __future__ import annotations

from app.notice.types import NoticeRecord


class MemoryNoticeStore:
    def __init__(self) -> None:
        self._rows: dict[str, NoticeRecord] = {}

    def get(self, cause_key: str) -> NoticeRecord | None:
        return self._rows.get(cause_key)

    def put(self, row: NoticeRecord) -> None:
        self._rows[row.cause_key] = row

    def list_all(self) -> tuple[NoticeRecord, ...]:
        return tuple(self._rows.values())

    def list_not_closed(self) -> tuple[NoticeRecord, ...]:
        return tuple(
            row
            for row in self._rows.values()
            if row.status != "closed"
        )
