"""Recording a Notice costs the user nothing.

`observe` ran inside the timing middleware before the response started: two
Supabase round trips (~300ms each), synchronous in async code, so the slow
response got slower and every other request on the worker froze meanwhile —
~170 times a day (2026-10-10). The web process now queues the sighting for one
writer thread.
"""

from __future__ import annotations

import threading
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.notice import NoticeBook, Sighting, wiring
from app.request_timing import RequestTimingMiddleware


class _SlowBook(NoticeBook):
    """A store as slow as production's, gated so the test controls it."""

    def __init__(self) -> None:
        base = NoticeBook.testing()
        super().__init__(store=base._store, clock=base._clock, persist=True)
        self.release = threading.Event()
        self.recorded: list[str] = []

    def observe(self, sighting: Sighting) -> None:
        self.release.wait(timeout=5)
        self.recorded.append(sighting.cause_class)


def test_a_slow_response_is_not_held_for_its_own_notice() -> None:
    book = _SlowBook()
    wiring.bind(book, background=True)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/slow")
    def slow() -> dict[str, bool]:
        return {"ok": True}

    try:
        with TestClient(app) as client:
            started = time.perf_counter()
            assert client.get("/slow").status_code == 200
            elapsed = time.perf_counter() - started
        # The store is blocked; a synchronous record would hold the response
        # for the full 5s gate.
        assert elapsed < 1.0
        assert book.recorded == []
        book.release.set()
        assert wiring.flush(timeout=5)
        assert book.recorded == ["slow_200"]
    finally:
        book.release.set()
        wiring.unbind()


def test_a_full_queue_drops_rather_than_blocks(monkeypatch) -> None:
    book = _SlowBook()
    monkeypatch.setattr(wiring, "_QUEUE_MAX", 2)
    wiring.bind(book, background=True)
    try:
        started = time.perf_counter()
        for _ in range(10):
            wiring.observe(Sighting.dead_man(belt="skill_floor"))
        assert time.perf_counter() - started < 0.5
    finally:
        book.release.set()
        wiring.unbind()


def test_the_job_runner_still_records_inline() -> None:
    """RQ forks a work-horse per job; a writer thread would not survive it."""
    book = NoticeBook.testing()
    wiring.bind(book)
    try:
        wiring.observe(Sighting.dead_man(belt="skill_floor"))
        assert [row.cause_key for row in book.snapshot()] == ["dead_man:skill_floor"]
    finally:
        wiring.unbind()
