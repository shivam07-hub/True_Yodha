"""Daily closer entry. GitHub Action harvests, settles proofs already on main, digests.

Cursor authors the close (CONTEXT.md). This process never opens a PR.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from app.config import settings
from app.database import get_supabase_admin
from app.notice.board import NoticeBook
from app.notice.clock import SystemClock
from app.notice.harvest import harvest_belts, harvest_railway, harvest_upload_stalls
from app.notice.postgres import PostgresNoticeStore
from app.notice.proofs import proofs_from_git_ref
from app.notice.types import CloseProof
from app.services.email_service import send_email

_logger = logging.getLogger("uvicorn.error")


class _ResendMailer:
    def send(self, *, subject: str, text: str) -> bool:
        recipient = settings.ops_alert_email.strip()
        if not recipient:
            _logger.warning("metric notice.digest_skipped reason=no_recipient")
            return False
        return send_email(to=recipient, subject=subject, text=text)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def harvest_into(book: NoticeBook, repo: Path) -> list[CloseProof]:
    for sighting in harvest_railway():
        book.observe(sighting)
    awaiting: int | None = None
    verifier_state: str | None = None
    stalled = False
    try:
        from app.database import get_supabase_admin_batch
        from app.services import skill_floor

        awaiting = skill_floor.count_missing_floor(
            get_supabase_admin_batch()
        ).awaiting_stage_a
    except Exception:
        _logger.exception("metric notice.harvest_skill_floor_failed")
    try:
        from app.services import verifier_health

        verifier_state = verifier_health.check_belt().state
    except Exception:
        _logger.exception("metric notice.harvest_verifier_failed")
    try:
        result = (
            get_supabase_admin()
            .table("cv_upload_jobs")
            .select("id")
            .eq("status", "failed")
            .gte("stall_requeue_count", 2)
            .limit(1)
            .execute()
        )
        stalled = bool(result.data)
    except Exception:
        _logger.exception("metric notice.harvest_upload_failed")
    for sighting in harvest_upload_stalls(stalled):
        book.observe(sighting)
    sha = _git(repo, "rev-parse", "HEAD") or "unknown"
    # Belt recovery is operational, not a git proof — close it from the digest.
    sightings, proofs = harvest_belts(
        skill_awaiting=awaiting,
        verifier_state=verifier_state,
        sha=sha,
        on_main=True,
    )
    for sighting in sightings:
        book.observe(sighting)
    return proofs


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
    repo = repo_root()
    proofs: list[CloseProof] = []
    try:
        proofs.extend(harvest_into(book, repo))
    except Exception:
        _logger.exception("metric notice.harvest_failed")
    _git(repo, "fetch", "origin", "main")
    main_sha = _git(repo, "rev-parse", "origin/main") or "unknown"
    try:
        proofs.extend(proofs_from_git_ref(repo, "origin/main", sha=main_sha))
    except Exception:
        _logger.exception("metric notice.proof_scan_failed")
    digest = book.settle(proofs)
    _logger.info(
        "notice digest as_of=%s open=%d closed=%d informed=%s",
        digest.as_of.isoformat(),
        len(digest.rows),
        len(digest.closed_this_run),
        digest.informed,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
