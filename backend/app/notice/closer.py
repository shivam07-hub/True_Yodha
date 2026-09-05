"""Daily closer entry. GitHub Action is a caller of NoticeBook.settle."""

from __future__ import annotations

import logging
import sys

from app.config import settings
from app.database import get_supabase_admin
from app.notice.board import NoticeBook
from app.notice.clock import SystemClock
from app.notice.postgres import PostgresNoticeStore
from app.services.email_service import send_email

_logger = logging.getLogger("uvicorn.error")


class _ResendMailer:
    def send(self, *, subject: str, text: str) -> bool:
        recipient = settings.ops_alert_email.strip()
        if not recipient:
            _logger.warning("metric notice.digest_skipped reason=no_recipient")
            return False
        return send_email(to=recipient, subject=subject, text=text)


def main() -> int:
    if not settings.supabase_url or not settings.supabase_service_key:
        _logger.error("notice closer needs SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return 1
    mailer = _ResendMailer() if settings.ops_alert_email.strip() else None
    book = NoticeBook(
        store=PostgresNoticeStore(get_supabase_admin()),
        clock=SystemClock(),
        persist=True,
        mailer=mailer,
    )
    digest = book.settle(())
    _logger.info(
        "notice digest as_of=%s open=%d closed=%d informed=%s",
        digest.as_of.isoformat(),
        len(digest.rows),
        len(digest.closed_this_run),
        digest.informed,
    )
    # Class-2 auto-fix (test + merge main) is the next Action step. Slice 1
    # records, digests, and settles proofs when a later step passes them.
    return 0


if __name__ == "__main__":
    sys.exit(main())
