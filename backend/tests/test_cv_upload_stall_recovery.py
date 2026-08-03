"""A CV upload must survive the deploy that kills its worker.

2026-08-03, prod. A `main` merge triggered a worker rollout. A real signup
uploaded a CV 95 seconds later; the draining worker picked the job up, reached
`structuring_cv`, and was killed. Nothing re-ran it. Both recovery clocks were
sized to the worst case — RQ's 15-minute abandonment TTL and a 20-minute DB
lease — so a 45-second job sat frozen for a quarter of an hour, then failed and
refunded, and the user was told to start over.

The work was never lost: the extracted text was still in the RQ payload the
whole time. These tests hold the recovery path to that fact.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.services import background, cv_workflow


def _row(**overrides):
    base = {
        "id": "job-1",
        "status": "processing",
        "current_phase": "structuring_cv",
        "lease_expires_at": (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat(),
        "stall_requeue_count": 0,
        "baseline_version_id": None,
    }
    base.update(overrides)
    return base


# ── the lease is a heartbeat, not a deadline ─────────────────────────────────


def test_lease_outlasts_a_phase_not_the_whole_job() -> None:
    """`set_phase` re-stamps the lease on every transition, so it only has to
    cover the longest SINGLE step. Sizing it to the RQ job timeout instead is
    what bought the 20-minute stall."""
    assert upload_jobs_repo._LEASE_SECONDS <= 300, (
        "a lease longer than 5 minutes is a deadline, not a heartbeat — a dead "
        "worker would again be undetectable for longer than the job itself takes"
    )
    # And long enough that a slow-but-alive provider call is not swept mid-flight.
    # Worst single phase observed in prod: 21.7s.
    assert upload_jobs_repo._LEASE_SECONDS >= 120


def test_a_freshly_stamped_lease_is_not_stale() -> None:
    fresh = _row(lease_expires_at=(datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat())
    assert not cv_workflow._is_stale_processing_job(fresh)


def test_an_expired_lease_is_stale() -> None:
    assert cv_workflow._is_stale_processing_job(_row())


def test_a_terminal_job_is_never_stale() -> None:
    assert not cv_workflow._is_stale_processing_job(_row(status="done"))
    assert not cv_workflow._is_stale_processing_job(_row(status="failed"))


# ── stalled work is re-run, not thrown away ──────────────────────────────────


def test_a_stalled_upload_is_requeued_not_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    requeued: list[tuple] = []
    monkeypatch.setattr(background, "can_requeue", lambda: True)
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: True)
    monkeypatch.setattr(upload_jobs_repo, "record_stall_requeue", lambda _id: None)
    monkeypatch.setattr(
        background, "requeue_abandoned",
        lambda lane, job_type, cid: requeued.append((lane, job_type, cid)) or True,
    )
    monkeypatch.setattr(
        upload_jobs_repo, "sweep_stale_processing_jobs",
        lambda **_kw: pytest.fail("a recoverable job must not be failed and refunded"),
    )
    monkeypatch.setattr(upload_jobs_repo, "fetch_status_for_owner", lambda *_a, **_k: _row())

    cv_workflow._sweep_stale_processing_job_if_needed("job-1", "user-1", _row())

    assert requeued == [(background.LANE_FAST, "cv_upload_analysis", "job-1")]


def test_requeue_is_bounded_so_a_poison_job_terminates(monkeypatch: pytest.MonkeyPatch) -> None:
    """Re-running whatever stalled, forever, turns one bad CV into an infinite
    loop across every replica."""
    swept: list[int] = []
    monkeypatch.setattr(
        background, "requeue_abandoned",
        lambda *_a, **_k: pytest.fail("budget is spent — must not requeue again"),
    )
    monkeypatch.setattr(
        upload_jobs_repo, "sweep_stale_processing_jobs",
        lambda **_kw: swept.append(1) or [],
    )
    monkeypatch.setattr(upload_jobs_repo, "fetch_status_for_owner", lambda *_a, **_k: _row())

    monkeypatch.setattr(background, "can_requeue", lambda: True)
    spent = _row(stall_requeue_count=cv_workflow._MAX_STALL_REQUEUES)
    cv_workflow._sweep_stale_processing_job_if_needed("job-1", "user-1", spent)

    assert swept, "with the budget spent the job must fail and refund"


def test_nothing_to_requeue_falls_through_to_refund(monkeypatch: pytest.MonkeyPatch) -> None:
    """RQ keeps the payload on a TTL. Once it is gone the job genuinely cannot be
    re-run, and a False from requeue must never be mistaken for 'handled'."""
    swept: list[int] = []
    released: list[str] = []
    monkeypatch.setattr(background, "can_requeue", lambda: True)
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: True)
    monkeypatch.setattr(upload_jobs_repo, "expire_lease", lambda jid: released.append(jid))
    monkeypatch.setattr(background, "requeue_abandoned", lambda *_a, **_k: False)
    monkeypatch.setattr(
        upload_jobs_repo, "sweep_stale_processing_jobs", lambda **_kw: swept.append(1) or []
    )
    monkeypatch.setattr(upload_jobs_repo, "fetch_status_for_owner", lambda *_a, **_k: _row())

    cv_workflow._sweep_stale_processing_job_if_needed("job-1", "user-1", _row())

    assert swept, "an unrecoverable job must still fail and refund"
    # The claim we took to try the requeue must not block the sweep that follows:
    # the sweep keys on an expired lease, and we had just renewed it.
    assert released == ["job-1"]


def test_a_healthy_job_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        background, "requeue_abandoned", lambda *_a, **_k: pytest.fail("not stale")
    )
    monkeypatch.setattr(
        upload_jobs_repo, "sweep_stale_processing_jobs", lambda **_kw: pytest.fail("not stale")
    )
    fresh = _row(lease_expires_at=(datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat())

    assert cv_workflow._sweep_stale_processing_job_if_needed("job-1", "user-1", fresh) is fresh


# ── the result write claims the job first ────────────────────────────────────


def test_a_swept_job_never_leaves_an_orphan_baseline(monkeypatch: pytest.MonkeyPatch) -> None:
    """`mark_done` is guarded on status, so it refuses to resurrect a swept job —
    but nothing rolls back the baseline written just before it. Without a claim,
    a slow-but-alive worker leaves the user refunded, the job failed, AND holding
    a usable baseline that `get_result` would serve."""
    import asyncio

    async def _skills(_text, **_kw):
        return {"skills_detected": [{"taxonomy_key": "Python (Programming Language)"}]}

    async def _structured(_text):
        return {"contact": {}, "experience": []}

    monkeypatch.setattr(upload_jobs_repo, "set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _skills)
    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _structured)
    # The job was swept while these two LLM calls were running.
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: False)
    monkeypatch.setattr(
        cv_workflow, "_persist_baseline_cv",
        lambda *_a, **_k: pytest.fail("must not write a baseline for a job we no longer own"),
    )
    monkeypatch.setattr(
        upload_jobs_repo, "mark_done", lambda *_a, **_k: pytest.fail("must not mark done")
    )

    asyncio.run(cv_workflow._run_cv_upload_stages(
        job_id="job-1", user_id="user-1", raw_text="cv text",
        content_hash="hash", source="pdf_upload", allow_retry=False,
        cv_repo=object(),
    ))


def test_the_claim_is_taken_and_the_result_persisted_when_still_ours(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The guard must not become a way to silently drop good work."""
    import asyncio

    async def _skills(_text, **_kw):
        return {"skills_detected": [{"taxonomy_key": "Python (Programming Language)"}]}

    async def _structured(_text):
        return {"contact": {}, "experience": []}

    persisted: list[str] = []
    monkeypatch.setattr(upload_jobs_repo, "set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_skills", _skills)
    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _structured)
    monkeypatch.setattr(upload_jobs_repo, "claim_for_completion", lambda _id: True)
    monkeypatch.setattr(
        cv_workflow, "_persist_baseline_cv", lambda *_a, **_k: persisted.append("x") or 7
    )
    monkeypatch.setattr(upload_jobs_repo, "mark_done", lambda *_a, **_k: True)
    monkeypatch.setattr(cv_workflow.background, "enqueue", lambda *_a, **_k: None)

    async def _no_match(_uid, **_kw):
        return None

    monkeypatch.setattr(cv_workflow, "_trigger_initial_match_compute", _no_match)

    asyncio.run(cv_workflow._run_cv_upload_stages(
        job_id="job-1", user_id="user-1", raw_text="cv text",
        content_hash="hash", source="pdf_upload", allow_retry=False,
        cv_repo=object(),
    ))
    assert persisted == ["x"]


# ── the worker says what it is dropping ──────────────────────────────────────


def test_shutdown_releases_the_leases_of_inflight_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    """The worker is the only participant that knows, at the moment it happens,
    which jobs it is abandoning. Staying silent is what made the user wait."""
    released: list[str] = []
    monkeypatch.setattr(upload_jobs_repo, "expire_lease", lambda jid: released.append(jid))
    cv_workflow._INFLIGHT_UPLOAD_JOBS.clear()
    cv_workflow._INFLIGHT_UPLOAD_JOBS.update({"job-a", "job-b"})

    assert cv_workflow.release_inflight_leases() == 2
    assert sorted(released) == ["job-a", "job-b"]
    cv_workflow._INFLIGHT_UPLOAD_JOBS.clear()


def test_shutdown_with_nothing_inflight_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        upload_jobs_repo, "expire_lease", lambda _jid: pytest.fail("nothing was running")
    )
    cv_workflow._INFLIGHT_UPLOAD_JOBS.clear()
    assert cv_workflow.release_inflight_leases() == 0


def test_expire_lease_backdates_so_the_sweep_comparison_is_unambiguous() -> None:
    """`sweep_stale_cv_upload_jobs` uses `< now()`. A lease stamped at exactly now
    would depend on clock skew between the app and Postgres."""
    import inspect

    source = inspect.getsource(upload_jobs_repo.expire_lease)
    assert "timedelta(seconds=1)" in source


def test_without_a_durable_queue_no_claim_is_taken(monkeypatch: pytest.MonkeyPatch) -> None:
    """The in-process fallback keeps no payload, so requeue can never work there.
    Checking that first means a poll does not write a lease it must immediately
    release — twice per poll, for every stalled job."""
    monkeypatch.setattr(background, "can_requeue", lambda: False)
    monkeypatch.setattr(
        upload_jobs_repo, "claim_for_completion",
        lambda _id: pytest.fail("must not claim when requeue is impossible"),
    )
    assert cv_workflow._requeue_stalled_job_if_possible("job-1", "user-1", _row()) is False


# ── an interrupted job must not be reported as a provider outage ─────────────


def test_an_abandoned_job_names_the_restart_not_the_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """RQ funnels two causes into one failure handler. Reporting a deploy as
    'our CV analysis service was busy' is false and points the user at the wrong
    remedy — it happened to a real signup on 2026-08-03."""
    import asyncio

    captured: list[dict] = []

    async def _capture(job_id, user_id, *, error_code, detail):
        captured.append({"error_code": error_code, "detail": detail})

    monkeypatch.setattr(cv_workflow, "_fail_and_refund", _capture)

    asyncio.run(cv_workflow._cv_upload_analysis_failure(
        {"job_id": "j", "user_id": "u", "_abandoned": True}
    ))
    assert captured[0]["error_code"] == "worker_replaced"
    assert "restart" in captured[0]["detail"]
    assert "busy" not in captured[0]["detail"]

    captured.clear()
    asyncio.run(cv_workflow._cv_upload_analysis_failure({"job_id": "j", "user_id": "u"}))
    assert captured[0]["error_code"] == "provider_unavailable"


def test_the_dispatcher_tells_handlers_which_cause_it_was() -> None:
    """The flag has to be set where RQ hands over the exception type, or the
    handler above can never distinguish the two."""
    from app.services.background import dispatch

    seen: list[dict] = []

    async def _handler(payload):
        seen.append(payload)

    monkeypatch_target = dispatch._FAILURE_HANDLERS
    monkeypatch_target["_probe"] = _handler
    try:
        class _Job:
            args = ("_probe", {"job_id": "j"})
            id = "j"

        class AbandonedJobError(Exception):
            pass

        dispatch.run_failure_sync(_Job(), None, AbandonedJobError, AbandonedJobError(), None)
        assert seen[0]["_abandoned"] is True

        seen.clear()
        dispatch.run_failure_sync(_Job(), None, TimeoutError, TimeoutError(), None)
        assert seen[0]["_abandoned"] is False
    finally:
        monkeypatch_target.pop("_probe", None)
