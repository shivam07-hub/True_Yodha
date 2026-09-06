"""Daily closer entry. GitHub Action is a caller of NoticeBook.settle."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

from app.config import settings
from app.database import get_supabase_admin
from app.notice.author import author_enabled, pick_open_500, try_close_one
from app.notice.board import NoticeBook
from app.notice.clock import SystemClock
from app.notice.gitops import GitHubMerger, head_sha, on_main
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


def run_notice_gates(repo: Path, files: list[str]) -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(repo / "backend")
    ruff_paths = [
        path[len("backend/") :]
        for path in files
        if path.endswith(".py") and path.startswith("backend/")
    ]
    if ruff_paths:
        ruff = subprocess.run(
            ["ruff", "check", *ruff_paths],
            cwd=repo / "backend",
            env=env,
            check=False,
        )
        if ruff.returncode != 0:
            return False
    tests = subprocess.run(
        ["python", "-m", "pytest", "backend/tests", "-q", "--tb=line"],
        cwd=repo,
        env=env,
        check=False,
    )
    return tests.returncode == 0


def harvest_into(book: NoticeBook, repo: Path) -> list[CloseProof]:
    for sighting in harvest_railway():
        book.observe(sighting)
    awaiting: int | None = None
    verifier_state: str | None = None
    stalled = False
    try:
        from app.services import skill_floor
        from app.database import get_supabase_admin_batch

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
    sha = head_sha(repo) or "unknown"
    sightings, proofs = harvest_belts(
        skill_awaiting=awaiting,
        verifier_state=verifier_state,
        sha=sha,
        on_main=True,
    )
    for sighting in sightings:
        book.observe(sighting)
    return proofs


def maybe_author(book: NoticeBook, repo: Path) -> CloseProof | None:
    if not author_enabled():
        return None
    row = pick_open_500(book.snapshot())
    if row is None:
        return None
    from app.notice.completer import OpenRouterCompleter

    merger = None
    if GitHubMerger.available():
        merger = GitHubMerger(repo, run_tests=run_notice_gates)
    return try_close_one(
        row,
        repo=repo,
        complete=OpenRouterCompleter(),
        run_tests=run_notice_gates,
        merger=merger,
    )


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
    subprocess.run(
        ["git", "fetch", "origin", "main"],
        cwd=repo,
        check=False,
        capture_output=True,
    )
    main_sha = head_sha(repo)
    try:
        proofs.extend(
            proofs_from_git_ref(
                repo,
                "origin/main",
                sha=main_sha or "unknown",
            )
        )
    except Exception:
        _logger.exception("metric notice.proof_scan_failed")
    try:
        authored = maybe_author(book, repo)
        if authored is not None:
            proofs.append(authored)
    except Exception:
        _logger.exception("metric notice.author_failed")
    digest = book.settle(proofs)
    _logger.info(
        "notice digest as_of=%s open=%d closed=%d informed=%s on_main=%s",
        digest.as_of.isoformat(),
        len(digest.rows),
        len(digest.closed_this_run),
        digest.informed,
        on_main(repo),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
