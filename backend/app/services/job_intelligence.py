from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, time as datetime_time, timezone
from typing import Callable
from uuid import UUID

from app.repositories.job_intelligence import JobIntelligenceRepository


@dataclass(frozen=True)
class FeedState:
    feed_version: str | None
    published_at: datetime | None
    imported_job_count: int
    latest_batch_date: str | None


@dataclass(frozen=True)
class FeedStateRead:
    state: FeedState
    etag: str
    not_modified: bool


@dataclass(frozen=True)
class FeedbackCommand:
    client_event_id: UUID
    job_id: str
    feedback_kind: str
    reason_code: str
    surface: str


@dataclass(frozen=True)
class FeedbackReceipt:
    event_id: int
    client_event_id: UUID
    job_id: str
    feedback_kind: str
    reason_code: str
    surface: str
    created_at: datetime
    created: bool


class InvalidJobFeedbackError(ValueError):
    pass


class FeedbackRateLimitError(RuntimeError):
    pass


PERSONAL_FEEDBACK_REASONS = frozenset(
    {
        "not_my_role",
        "location",
        "seniority",
        "compensation",
        "company",
        "skills_gap",
        "already_applied",
    }
)
QUALITY_FEEDBACK_REASONS = frozenset(
    {
        "looks_old",
        "apply_link_closed",
        "duplicate",
        "details_wrong",
        "posting_inactive",
    }
)
FEEDBACK_SURFACES = frozenset({"dashboard", "market", "job_detail", "other"})
MAX_DAILY_QUALITY_FEEDBACK = 3


class FeedStateCache:
    def __init__(
        self,
        *,
        ttl_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._loaded_at: float | None = None
        self._state: FeedState | None = None
        self._lock = threading.Lock()

    def get_or_load(self, loader: Callable[[], FeedState]) -> FeedState:
        now = self.clock()
        if self._is_fresh(now):
            return self._state  # type: ignore[return-value]
        with self._lock:
            now = self.clock()
            if self._is_fresh(now):
                return self._state  # type: ignore[return-value]
            self._state = loader()
            self._loaded_at = now
            return self._state

    def _is_fresh(self, now: float) -> bool:
        return (
            self._state is not None
            and self._loaded_at is not None
            and now - self._loaded_at < self.ttl_seconds
        )


_feed_state_cache = FeedStateCache()


class JobIntelligence:
    """Deep module for feed publication, feedback, and Job Pulse."""

    def __init__(
        self,
        repository: JobIntelligenceRepository,
        *,
        feed_cache: FeedStateCache = _feed_state_cache,
    ) -> None:
        self.repository = repository
        self.feed_cache = feed_cache

    def feed_state(self, if_none_match: str | None = None) -> FeedStateRead:
        state = self.feed_cache.get_or_load(self._load_feed_state)
        etag = _feed_etag(state.feed_version)
        return FeedStateRead(
            state=state,
            etag=etag,
            not_modified=if_none_match == etag,
        )

    def record_feedback(
        self,
        user_id: str,
        command: FeedbackCommand,
    ) -> FeedbackReceipt:
        _validate_feedback(command)
        event_id = str(command.client_event_id)
        existing = self.repository.find_feedback(user_id, event_id)
        if existing is not None:
            return _feedback_receipt(existing, created=False)

        if command.feedback_kind == "quality":
            today = datetime.now(timezone.utc).date()
            since = datetime.combine(
                today,
                datetime_time.min,
                tzinfo=timezone.utc,
            )
            count = self.repository.count_quality_feedback_since(user_id, since)
            if count >= MAX_DAILY_QUALITY_FEEDBACK:
                raise FeedbackRateLimitError

        row, created = self.repository.insert_feedback(
            {
                "client_event_id": event_id,
                "job_id": command.job_id,
                "user_id": user_id,
                "feedback_kind": command.feedback_kind,
                "reason_code": command.reason_code,
                "surface": command.surface,
            }
        )
        return _feedback_receipt(row, created=created)

    def _load_feed_state(self) -> FeedState:
        publication = self.repository.latest_feed_publication()
        if not publication:
            return FeedState(
                feed_version=None,
                published_at=None,
                imported_job_count=0,
                latest_batch_date=None,
            )
        return FeedState(
            feed_version=str(publication["run_id"]),
            published_at=_parse_datetime(publication.get("created_at")),
            imported_job_count=int(publication.get("total_rows") or 0),
            latest_batch_date=_marker_to_iso_date(
                self.repository.latest_job_batch_marker()
            ),
        )


def _feed_etag(feed_version: str | None) -> str:
    return f'"feed-{feed_version or "empty"}"'


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif value:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _validate_feedback(command: FeedbackCommand) -> None:
    reasons = (
        PERSONAL_FEEDBACK_REASONS
        if command.feedback_kind == "personal"
        else QUALITY_FEEDBACK_REASONS
        if command.feedback_kind == "quality"
        else frozenset()
    )
    if command.reason_code not in reasons:
        raise InvalidJobFeedbackError(
            f"{command.reason_code!r} is not valid for {command.feedback_kind!r}"
        )
    if command.surface not in FEEDBACK_SURFACES:
        raise InvalidJobFeedbackError(f"Unknown feedback surface: {command.surface}")


def _feedback_receipt(
    row: dict,
    *,
    created: bool,
) -> FeedbackReceipt:
    created_at = _parse_datetime(row.get("created_at"))
    if created_at is None:
        raise RuntimeError("Feedback row has no created_at")
    return FeedbackReceipt(
        event_id=int(row["id"]),
        client_event_id=UUID(str(row["client_event_id"])),
        job_id=str(row["job_id"]),
        feedback_kind=str(row["feedback_kind"]),
        reason_code=str(row["reason_code"]),
        surface=str(row["surface"]),
        created_at=created_at,
        created=created,
    )


def _marker_to_iso_date(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return datetime.strptime(text, "%Y%m%d").date().isoformat()
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None
