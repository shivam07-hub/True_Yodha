"""Postgres Notice record — production adapter. Service-role only."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, cast

from supabase import Client

from app.notice.types import CauseClass, NoticeRecord, Status


class PostgresNoticeStore:
    def __init__(self, client: Client) -> None:
        self._client = client

    def get(self, cause_key: str) -> NoticeRecord | None:
        result = (
            self._client.table("notices")
            .select("*")
            .eq("cause_key", cause_key)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return _from_row(rows[0])

    def put(self, row: NoticeRecord) -> None:
        self._client.table("notices").upsert(
            _to_row(row),
            on_conflict="cause_key",
        ).execute()

    def list_all(self) -> tuple[NoticeRecord, ...]:
        result = self._client.table("notices").select("*").execute()
        return tuple(_from_row(item) for item in (result.data or []))

    def list_not_closed(self) -> tuple[NoticeRecord, ...]:
        result = (
            self._client.table("notices")
            .select("*")
            .neq("status", "closed")
            .execute()
        )
        return tuple(_from_row(item) for item in (result.data or []))


def _to_row(row: NoticeRecord) -> dict[str, Any]:
    return {
        "cause_key": row.cause_key,
        "cause_class": row.cause_class,
        "status": row.status,
        "occurrence_count": row.occurrence_count,
        "first_seen_at": row.first_seen_at.isoformat(),
        "last_seen_at": row.last_seen_at.isoformat(),
        "last_method": row.last_method,
        "last_path": row.last_path,
        "last_correlation_id": row.last_correlation_id,
        "closing_commit": row.closing_commit,
        "blocked_reason": row.blocked_reason,
        "proof_test": row.proof_test,
    }


def _from_row(data: dict[str, Any]) -> NoticeRecord:
    return NoticeRecord(
        cause_key=str(data["cause_key"]),
        cause_class=cast(CauseClass, data["cause_class"]),
        status=cast(Status, data["status"]),
        occurrence_count=int(data["occurrence_count"]),
        first_seen_at=_dt(data["first_seen_at"]),
        last_seen_at=_dt(data["last_seen_at"]),
        last_method=str(data.get("last_method") or ""),
        last_path=str(data.get("last_path") or ""),
        last_correlation_id=str(data.get("last_correlation_id") or ""),
        closing_commit=data.get("closing_commit"),
        blocked_reason=data.get("blocked_reason"),
        proof_test=data.get("proof_test"),
    )


def _dt(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
