"""Bound concurrent Supabase reads before they can saturate Postgres.

The Data API is HTTP from the application process, but each GET can still
occupy a finite PostgREST/Postgres worker.  This small bulkhead deliberately
queues for only a short time and then rejects *before* a request reaches
Supabase.  That keeps a reload responsive: callers retain their cached state
and retry after the advertised backoff instead of waiting for the database
statement timeout.
"""

from __future__ import annotations

from contextlib import contextmanager
from threading import BoundedSemaphore
from typing import Iterator


class ReadCapacityExceeded(Exception):
    """The local process has no safe Supabase-read capacity available."""

    def __init__(self, retry_after_seconds: int = 1) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__("Supabase read capacity is temporarily exhausted")


class ReadCapacityLimiter:
    """A process-wide, bounded waiting room for synchronous Data API reads."""

    def __init__(self, *, max_inflight: int, queue_timeout_seconds: float) -> None:
        if max_inflight < 1:
            raise ValueError("max_inflight must be at least one")
        if queue_timeout_seconds < 0:
            raise ValueError("queue_timeout_seconds must not be negative")
        self._semaphore = BoundedSemaphore(max_inflight)
        self._queue_timeout_seconds = queue_timeout_seconds

    @contextmanager
    def claim(self) -> Iterator[None]:
        acquired = self._semaphore.acquire(timeout=self._queue_timeout_seconds)
        if not acquired:
            raise ReadCapacityExceeded()
        try:
            yield
        finally:
            self._semaphore.release()
