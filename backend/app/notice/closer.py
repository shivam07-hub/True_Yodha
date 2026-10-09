"""The daily closer: harvest the belts, settle proofs already on main, digest.

pg_cron calls `POST /internal/notice/close` on the production API once a day
(migration 20261010120000). It ran as a GitHub Action until 2026-10-06, when the
Action stopped being scheduled — and the closer's own dead-man could only reach
the operator through the digest the closer no longer sent. The in-database
scheduler is the one thing that kept running that week.

Proofs come from the deployed tree, not a git checkout: production runs `main`,
so every `NOTICE_CAUSE_KEY` in the tests it shipped with IS on main.

Cursor authors the close (CONTEXT.md). This process never opens a PR.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from app.config import settings
from app.database import get_supabase_admin
from app.notice.board import NoticeBook
from app.notice.clock import SystemClock
from app.notice.harvest import harvest_belts, harvest_upload_stalls
from app.notice.postgres import PostgresNoticeStore
from app.notice.proofs import proofs_from_tests
from app.notice.types import CloseProof, Digest
from app.services.email_service import send_email
from app.services.probe import BeltState

_logger = logging.getLogger("uvicorn.error")


class _ResendMailer:
    def send(self, *, subject: str, text: str) -> bool:
        recipient = settings.ops_alert_email.strip()
        if not recipient:
            _logger.warning("metric notice.digest_skipped reason=no_recipient")
            return False
        return send_email(to=recipient, subject=subject, text=text)


TESTS_ROOT = Path(__file__).resolve().parents[2] / "tests"


def deployed_sha() -> str:
    return os.environ.get("RAILWAY_GIT_COMMIT_SHA", "").strip() or "unknown"


def harvest_into(book: NoticeBook, sha: str) -> list[CloseProof]:
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
    ingestion_state: str | None = None
    try:
        from app.services import ingestion_health

        ingestion_state = ingestion_health.check_ingestion().state
    except Exception:
        _logger.exception("metric notice.harvest_ingestion_failed")
    snapshot_states: dict[str, BeltState] | None = None
    try:
        from app.services import snapshot_health

        snapshot_states = snapshot_health.check_snapshots().tasks
    except Exception:
        _logger.exception("metric notice.harvest_snapshots_failed")
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
    # Belt recovery is operational, not a git proof — close it from the digest.
    sightings, proofs = harvest_belts(
        skill_awaiting=awaiting,
        verifier_state=verifier_state,
        ingestion_state=ingestion_state,
        closer_state="ok",
        snapshot_states=snapshot_states,
        sha=sha,
        on_main=True,
    )
    for sighting in sightings:
        book.observe(sighting)
    return proofs


def run(*, tests_root: Path = TESTS_ROOT, sha: str | None = None) -> Digest:
    """One closer pass. Production only — its tests are the proofs on main."""
    sha = sha or deployed_sha()
    mailer = _ResendMailer() if settings.ops_alert_email.strip() else None
    book = NoticeBook(
        store=PostgresNoticeStore(get_supabase_admin()),
        clock=SystemClock(),
        persist=True,
        mailer=mailer,
    )
    proofs: list[CloseProof] = []
    try:
        proofs.extend(harvest_into(book, sha))
    except Exception:
        _logger.exception("metric notice.harvest_failed")
    proofs.extend(proofs_from_tests(tests_root, sha=sha, on_main=True))
    digest = book.settle(proofs)
    _logger.warning(
        "metric notice.closer_ran as_of=%s open=%d closed=%d informed=%s sha=%s",
        digest.as_of.isoformat(),
        len(digest.rows),
        len(digest.closed_this_run),
        digest.informed,
        sha,
    )
    return digest


def run_or_alert() -> None:
    """The scheduled entry. A pass that dies says so by mail, outside the digest.

    The digest is the closer's own output, so it cannot report the closer
    failing. One plain mail per failed pass is the channel that survives it.
    """
    try:
        run()
    except Exception as exc:
        _logger.exception("metric notice.closer_failed")
        recipient = settings.ops_alert_email.strip()
        if recipient:
            send_email(
                to=recipient,
                subject="Myro Notice closer FAILED",
                text=f"The daily closer raised {type(exc).__name__}: {exc}\n"
                f"sha={deployed_sha()}\nNo digest was sent. Railway logs: metric notice.closer_failed",
            )
