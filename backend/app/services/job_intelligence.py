from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import datetime, time as datetime_time, timezone
from typing import Callable
from uuid import UUID

from app.repositories.job_intelligence import JobIntelligenceRepository
from app.services.job_intelligence_policy import (
    listing_confidence,
    marker_to_iso_date,
    parse_datetime,
    response_signal,
    validate_feedback,
    visible_count,
)


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


@dataclass(frozen=True)
class JobPulse:
    job_id: str
    first_seen_at: str | None
    last_verified_at: str | None
    is_stale: bool
    listing_confidence: str
    tracking_count: int | None
    outcomes_shared: int | None
    ghosted_count: int | None
    response_signal: str | None
    quality_report_count: int | None


class InvalidJobFeedbackError(ValueError):
    pass


class FeedbackRateLimitError(RuntimeError):
    pass


class InvalidJobPulseRequest(ValueError):
    pass


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
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self.repository = repository
        self.feed_cache = feed_cache
        self.now = now

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
            today = self.now().date()
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

    def pulses(self, job_ids: list[str]) -> list[JobPulse]:
        unique_ids = list(dict.fromkeys(job_id for job_id in job_ids if job_id))
        if not unique_ids or len(unique_ids) > 100:
            raise InvalidJobPulseRequest("job_ids must contain 1-100 unique IDs")
        rows = self.repository.pulse_rows(unique_ids)
        by_id = {str(row["job_id"]): row for row in rows}
        return [
            _to_job_pulse(by_id[job_id], now=self.now())
            for job_id in unique_ids
            if job_id in by_id
        ]

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
            published_at=parse_datetime(publication.get("created_at")),
            imported_job_count=int(publication.get("total_rows") or 0),
            latest_batch_date=marker_to_iso_date(
                self.repository.latest_job_batch_marker()
            ),
        )


def _feed_etag(feed_version: str | None) -> str:
    return f'"feed-{feed_version or "empty"}"'


def _validate_feedback(command: FeedbackCommand) -> None:
    if not validate_feedback(
        feedback_kind=command.feedback_kind,
        reason_code=command.reason_code,
        surface=command.surface,
    ):
        raise InvalidJobFeedbackError(
            f"{command.reason_code!r} is not valid for {command.feedback_kind!r}"
        )


def _feedback_receipt(
    row: dict,
    *,
    created: bool,
) -> FeedbackReceipt:
    created_at = parse_datetime(row.get("created_at"))
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


def _to_job_pulse(row: dict, *, now: datetime) -> JobPulse:
    confidence, is_stale = listing_confidence(row, now=now)
    outcome_count = row.get("outcome_count")
    quality_count = row.get("quality_report_count")
    return JobPulse(
        job_id=str(row["job_id"]),
        first_seen_at=marker_to_iso_date(row.get("first_seen")),
        last_verified_at=marker_to_iso_date(row.get("last_seen")),
        is_stale=is_stale,
        listing_confidence=confidence,
        tracking_count=visible_count(
            row.get("tracking_count"),
            cohort=row.get("tracking_count"),
        ),
        outcomes_shared=visible_count(outcome_count, cohort=outcome_count),
        ghosted_count=visible_count(
            row.get("ghosted_count"),
            cohort=outcome_count,
        ),
        response_signal=response_signal(
            applied_count=row.get("applied_count"),
            responded_count=row.get("responded_count"),
        ),
        quality_report_count=visible_count(
            quality_count,
            cohort=quality_count,
        ),
    )
