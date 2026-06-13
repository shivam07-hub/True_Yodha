from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Callable

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
