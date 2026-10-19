"""Process-global observe() for request handlers. Fail-soft if unbound.

In the web process a sighting is recorded OFF the request path. `observe` was
called from the timing middleware before the response started, and recording
is two Supabase round trips (read the row, upsert it — ~300ms each, measured
2026-10-10). Being synchronous inside async middleware, it held that response
back AND froze every other request on the worker while it ran: ~170 recordings
a day, each landing exactly when the server was already slow. Instruments must
cost the user nothing (Shivam, 2026-10-10).

So the web process hands each sighting to one writer thread through a bounded
queue. A full queue drops the sighting with a metric — a lost operator record
is cheaper than a stalled user. The Job Runner keeps writing inline: RQ forks a
work-horse per job, a thread does not survive the fork, and a job's own
latency is no user's wait.
"""

from __future__ import annotations

import logging
import queue
import threading
from datetime import datetime, timezone

from app.notice.board import NoticeBook
from app.notice.stall import StallWindow
from app.notice.types import Sighting

_logger = logging.getLogger("app.notice")

_QUEUE_MAX = 1000
# How often the writer wakes with nothing queued, to file slow reads whose
# stall window has closed.
_TICK_SECONDS = 5.0
_stall_window = StallWindow

_book: NoticeBook | None = None
_queue: queue.Queue[Sighting] | None = None
_writer: threading.Thread | None = None


def bind(book: NoticeBook, *, background: bool = False) -> None:
    global _book, _queue, _writer
    _book = book
    if not background:
        _queue = None
        _writer = None
        return
    _queue = queue.Queue(maxsize=_QUEUE_MAX)
    _writer = threading.Thread(target=_drain, args=(book, _queue), name="notice-writer", daemon=True)
    _writer.start()


def unbind() -> None:
    global _book, _queue, _writer
    _book = None
    _queue = None
    _writer = None


def observe(sighting: Sighting) -> None:
    book, pending = _book, _queue
    if book is None:
        return
    if pending is None:
        book.observe(sighting)
        return
    try:
        pending.put_nowait(sighting)
    except queue.Full:
        _logger.warning(
            "metric notice.dropped reason=queue_full cause_class=%s", sighting.cause_class
        )


def flush(timeout: float = 5.0) -> bool:
    """Wait until every queued sighting is taken. A slow read is then still held
    for its stall window. Tests and shutdown only."""
    pending = _queue
    if pending is None:
        return True
    done = threading.Event()

    def _wait() -> None:
        pending.join()
        done.set()

    threading.Thread(target=_wait, daemon=True).start()
    return done.wait(timeout)


def _drain(book: NoticeBook, pending: queue.Queue[Sighting]) -> None:
    """The one writer. Slow reads wait out their stall window here (`stall.py`)."""
    stalls = _stall_window()
    while True:
        try:
            sighting = pending.get(timeout=_TICK_SECONDS)
        except queue.Empty:
            _file(book, stalls.due(datetime.now(timezone.utc)))
            continue
        try:
            _file(book, stalls.admit(sighting, datetime.now(timezone.utc)))
        finally:
            pending.task_done()


def _file(book: NoticeBook, sightings: tuple[Sighting, ...]) -> None:
    for sighting in sightings:
        book.observe(sighting)  # never raises: NoticeBook.observe is fail-soft


def bind_from_settings(*, background: bool = False) -> None:
    """Prod web and Job Runner. Dev shares the DB and must not write operator rows."""
    from app.config import settings

    if not settings.is_production:
        return
    if not settings.supabase_url or not settings.supabase_service_key:
        _logger.warning("metric notice.bind_skipped reason=no_supabase")
        return
    try:
        from app.database import get_supabase_admin
        from app.notice.clock import SystemClock
        from app.notice.postgres import PostgresNoticeStore

        bind(
            NoticeBook(
                store=PostgresNoticeStore(get_supabase_admin()),
                clock=SystemClock(),
                persist=True,
            ),
            background=background,
        )
    except Exception:
        _logger.exception("metric notice.bind_failed")
