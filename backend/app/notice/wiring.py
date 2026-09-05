"""Process-global observe() for request handlers. Fail-soft if unbound."""

from __future__ import annotations

import logging

from app.notice.board import NoticeBook
from app.notice.types import Sighting

_logger = logging.getLogger("app.notice")

_book: NoticeBook | None = None


def bind(book: NoticeBook) -> None:
    global _book
    _book = book


def unbind() -> None:
    global _book
    _book = None


def observe(sighting: Sighting) -> None:
    if _book is None:
        return
    _book.observe(sighting)


def bind_from_settings() -> None:
    """Prod web process only. Dev shares the DB and must not write operator rows."""
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
            )
        )
    except Exception:
        _logger.exception("metric notice.bind_failed")
