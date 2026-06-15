"""API tests for the two-phase CV upload (ADR-0004).

POST /cv/upload now returns 202 + job_id (or 200 + done payload on hash-cache
hit). The slow LLM work runs in a background task; clients poll
GET /cv/upload/status/{job_id} for terminal state.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.routers.cv import upload as cv_upload
from app.services import cv_workflow


class _FakeCVRepository:
    """Hash-miss repo — forces XP charge + async path in all tests."""
    def __init__(self) -> None:
        self.client = object()

    def find_by_content_hash(self, _user_id: str, _content_hash: str) -> None:
        return None

    def count_user_skills(self, _user_id: str) -> int:
        return 0

    def get_current_score(self, _user_id: str) -> float | None:
        return None


class _CachedCVRepository:
    """Hash-hit repo — exercises the free synchronous return path."""
    def __init__(self) -> None:
        self.client = object()

    def find_by_content_hash(self, _user_id: str, _content_hash: str) -> dict:
        return {"id": 42}

    def count_user_skills(self, _user_id: str) -> int:
        return 7

    def get_current_score(self, _user_id: str) -> float | None:
        return 72.5


def _override_principal_and_repo(repo) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_token_cv_repository] = lambda: repo


def _patch_async_workflow(monkeypatch, *, captured: dict[str, Any] | None = None) -> None:
    """Replace the async background runner so tests don't hit the LLM or DB."""
    async def _noop_run(**kwargs):  # type: ignore[no-untyped-def]
        if captured is not None:
            captured.update(kwargs)
    monkeypatch.setattr(cv_workflow, "_run_cv_upload_job", _noop_run)


def _patch_xp(monkeypatch, *, balance: int = 3000) -> dict[str, Any]:
    state = {"balance": balance, "charged": 0, "refunded": 0, "last_ref": None}
    async def _charge(user_id, amount, action, *, floor=0, ref_table=None, ref_id=None):
        if state["balance"] - amount < floor:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Out of Myro Coins")
        state["balance"] -= amount
        state["charged"] += amount
        state["last_ref"] = (ref_table, ref_id)
        return state["balance"]
    async def _refund(user_id, amount, action, reason, *, ref_table, ref_id):
        state["balance"] += amount
        state["refunded"] += amount
        return state["balance"]
    async def _balance(user_id):
        return state["balance"]
    monkeypatch.setattr(cv_workflow, "charge_or_raise", _charge)
    monkeypatch.setattr(cv_workflow, "refund", _refund)
    monkeypatch.setattr(cv_workflow, "get_xp_balance", _balance)
    return state


def _patch_jobs_create(monkeypatch, *, job_id: str = "job-123") -> None:
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "create_processing_job",
        lambda **_kwargs: job_id,
    )
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "mark_charged",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "mark_failed",
        lambda *_a, **_k: None,
    )


# ─── Phase-1 tests ────────────────────────────────────────────────────────────

def test_upload_returns_202_with_job_id_on_fresh_content(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "Python engineer with five years of backend experience building production APIs, data pipelines, and shipping reliable systems.")
    _patch_jobs_create(monkeypatch, job_id="job-abc")
    _patch_async_workflow(monkeypatch)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF", "application/pdf")},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "processing"
    assert body["job_id"] == "job-abc"
    assert state["charged"] == 200  # CV_UPLOAD_XP_COST
    assert state["balance"] == 2800
    # Charge MUST be tied to the job_id so the ledger row + refund idempotency work.
    assert state["last_ref"] == ("cv_upload_jobs", "job-abc")


def test_upload_returns_hash_cache_hit_without_charging(monkeypatch) -> None:
    _override_principal_and_repo(_CachedCVRepository())
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "Same CV uploaded again. The hash check below must short-circuit before any LLM or XP charge runs.")
    _patch_jobs_create(monkeypatch)

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF", "application/pdf")},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202  # route declares 202 default; payload distinguishes
    body = res.json()
    assert body["status"] == "done"
    assert body["skills_detected"] == 7
    assert body["score"] == 72.5
    assert state["charged"] == 0  # hash-cache hits never charge


def test_upload_blocks_with_400_when_xp_insufficient(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    _patch_xp(monkeypatch, balance=50)  # < 200 cost
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "Python developer with several years of experience building backend services and CLI tools for production.")
    _patch_jobs_create(monkeypatch, job_id="job-blocked")  # job row pre-charge per new ordering

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF", "application/pdf")},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 400
    assert "Out of Myro Coins" in res.json()["detail"]


def test_submit_text_below_min_length_returns_422(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    _patch_xp(monkeypatch, balance=3000)

    try:
        with TestClient(app) as client:
            res = client.post("/cv/text", json={"text": "too short"})
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 422


def test_submit_text_rate_limit_fail_open_when_supabase_unavailable(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    _patch_xp(monkeypatch, balance=3000)

    def _raise_supabase_unavailable():
        raise RuntimeError("supabase unavailable")

    monkeypatch.setattr(cv_workflow, "get_supabase_admin", _raise_supabase_unavailable)

    try:
        with TestClient(app) as client:
            res = client.post("/cv/text", json={"text": "too short"})
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 422


def test_upload_returns_422_without_charge_when_pdf_has_no_text(monkeypatch) -> None:
    """Scanned/image-only PDFs extract to empty string. Reject in phase 1
    so the user is not charged-refunded in a retry loop."""
    _override_principal_and_repo(_FakeCVRepository())
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "")

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("scan.pdf", b"%PDF", "application/pdf")},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "unreadable_text"
    assert "couldn't read any text" in detail["message"].lower()
    assert state["charged"] == 0  # critical: no charge on rejected upload


# ─── Async runner tests (drive _run_cv_upload_job directly) ───────────────────

class _AdminFakeRepo:
    """Stand-in for both CVVersionsRepository and ScoresRepository in the background path."""
    def __init__(self) -> None:
        self.client = object()
        self.profile_updates: list = []
        self.created: list = []

    def find_by_content_hash(self, *_a, **_k):
        return None

    def update_cv_profile(self, _user_id, payload):
        self.profile_updates.append(payload)

    def create(self, _user_id, spec):
        self.created.append(spec)
        return {"id": 1}

    def count_user_skills(self, _user_id):
        return 0

    def get_current_score(self, _user_id):
        return None


def _patch_admin_repo(monkeypatch, repo) -> None:
    monkeypatch.setattr(cv_workflow, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(cv_workflow, "CVVersionsRepository", lambda _client: repo)
    monkeypatch.setattr(cv_workflow, "ScoresRepository", lambda _client: repo)


def test_background_run_marks_done_on_success(monkeypatch) -> None:
    repo = _AdminFakeRepo()
    _patch_admin_repo(monkeypatch, repo)

    async def _parse(_text, provider=None):
        return {
            "skills_detected": [{"taxonomy_key": "Python", "signal_type": "project", "xp_awarded": 150, "evidence": "X"}],
            "cv_structured": {"summary": "Engineer"},
        }
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _parse)
    monkeypatch.setattr(cv_workflow.scoring, "record_cv_score", lambda *_a, **_k: {"total_score": 71.0})

    done_calls: list[dict] = []
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_done", lambda job_id, **kw: done_calls.append({"job_id": job_id, **kw}))
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda *a, **k: pytest.fail("should not fail"))
    async def _no_initial(_user_id): return None
    monkeypatch.setattr(cv_workflow, "_trigger_initial_match_compute", _no_initial)

    asyncio.run(cv_workflow._run_cv_upload_job(
        job_id="job-1", user_id="u1", raw_text="text", content_hash="h",
    ))

    assert done_calls == [{"job_id": "job-1", "skills_detected": 1, "score": 71.0}]
    assert repo.profile_updates == [{"onboarding_complete": True}]
    assert repo.created and repo.created[0].kind == "baseline_upload"


def test_background_run_refunds_and_fails_on_provider_outage(monkeypatch) -> None:
    repo = _AdminFakeRepo()
    _patch_admin_repo(monkeypatch, repo)

    async def _parse(_text, provider=None):
        return {"skills_detected": [], "provider_failed": True}
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _parse)

    refunds: list[tuple] = []
    async def _refund(user_id, amount, action, reason, *, ref_table, ref_id):
        refunds.append((user_id, amount, action, reason, ref_table, ref_id))
        return 3000
    monkeypatch.setattr(cv_workflow, "refund", _refund)

    failed_calls: list[dict] = []
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda job_id, **kw: failed_calls.append({"job_id": job_id, **kw}))
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_done", lambda *a, **k: pytest.fail("should not mark done"))

    asyncio.run(cv_workflow._run_cv_upload_job(
        job_id="job-2", user_id="u1", raw_text="text", content_hash="h",
    ))

    assert refunds == [("u1", 200, "cv_upload", "provider_unavailable", "cv_upload_jobs", "job-2")]
    assert failed_calls[0]["error_code"] == "provider_unavailable"
    assert failed_calls[0]["refunded"] is True
    assert repo.created == []  # nothing persisted on failure


def test_background_run_refunds_when_no_skills_extracted(monkeypatch) -> None:
    repo = _AdminFakeRepo()
    _patch_admin_repo(monkeypatch, repo)

    async def _parse(_text, provider=None):
        return {"skills_detected": []}
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _parse)

    refunded = {"count": 0}
    async def _refund(*_a, **_k):
        refunded["count"] += 1
        return 3000
    monkeypatch.setattr(cv_workflow, "refund", _refund)

    failed_calls: list[dict] = []
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda job_id, **kw: failed_calls.append(kw))
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_done", lambda *a, **k: pytest.fail("should not mark done"))

    asyncio.run(cv_workflow._run_cv_upload_job(
        job_id="job-3", user_id="u1", raw_text="text", content_hash="h",
    ))

    assert refunded["count"] == 1
    assert failed_calls[0]["error_code"] == "no_skills"


def test_background_run_refunds_when_taxonomy_mapping_fails(monkeypatch) -> None:
    repo = _AdminFakeRepo()
    _patch_admin_repo(monkeypatch, repo)

    async def _parse(_text, provider=None):
        return {"skills_detected": [{"taxonomy_key": "Made-up", "signal_type": "project", "xp_awarded": 50, "evidence": "X"}]}
    monkeypatch.setattr(cv_workflow.cv_parser, "parse_cv_text", _parse)

    def _fail_score(*_a, **_k):
        raise ValueError("no taxonomy")
    monkeypatch.setattr(cv_workflow.scoring, "record_cv_score", _fail_score)

    refunded = {"count": 0}
    async def _refund(*_a, **_k):
        refunded["count"] += 1
        return 3000
    monkeypatch.setattr(cv_workflow, "refund", _refund)

    failed_calls: list[dict] = []
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_failed", lambda job_id, **kw: failed_calls.append(kw))
    monkeypatch.setattr(cv_workflow.upload_jobs_repo, "mark_done", lambda *a, **k: pytest.fail("should not mark done"))

    asyncio.run(cv_workflow._run_cv_upload_job(
        job_id="job-4", user_id="u1", raw_text="text", content_hash="h",
    ))

    assert refunded["count"] == 1
    assert failed_calls[0]["error_code"] == "taxonomy_unmapped"


# ─── Status endpoint test ────────────────────────────────────────────────────

def test_status_endpoint_returns_polled_row(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "fetch_status_for_owner",
        lambda job_id, user_id, db=None: {
            "id": job_id,
            "status": "done",
            "skills_detected": 5,
            "score": 64.2,
            "error_code": None,
            "error_detail": None,
            "xp_charged": 200,
            "xp_refunded": False,
            "created_at": "x",
            "finished_at": "y",
        },
    )

    async def _balance(_user_id): return 2800
    monkeypatch.setattr(cv_workflow, "get_xp_balance", _balance)

    try:
        with TestClient(app) as client:
            res = client.get("/cv/upload/status/job-xyz")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "done"
    assert body["score"] == 64.2
    assert body["new_coin_balance"] == 2800
    assert body["redirect_to"] == "/onboarding/score"


def test_upload_with_idempotency_key_returns_existing_job_without_recharging(monkeypatch) -> None:
    """Same idempotency_key + same user → return existing job, no second charge."""
    _override_principal_and_repo(_FakeCVRepository())
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(cv_workflow.cv_parser, "extract_raw_text", lambda *_a, **_k: "X" * 200)
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "find_by_idempotency_key",
        lambda user_id, key: {"id": "existing-job-1", "status": "processing"},
    )
    # If charging happened, this would be incremented; assertion below pins it at 0.
    _patch_jobs_create(monkeypatch, job_id="new-job-should-not-fire")

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF", "application/pdf")},
                headers={"Idempotency-Key": "client-uuid-123"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "processing"
    assert body["job_id"] == "existing-job-1"
    assert state["charged"] == 0  # critical: no double-charge on retry


def test_upload_with_failed_idempotency_key_returns_terminal_failure(monkeypatch) -> None:
    """A stale browser idempotency key must not masquerade as a live queued job."""
    _override_principal_and_repo(_FakeCVRepository())
    state = _patch_xp(monkeypatch, balance=3000)
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "find_by_idempotency_key",
        lambda user_id, key: {
            "id": "orphaned-job-1",
            "status": "failed",
            "xp_charged": 200,
            "xp_refunded": True,
            "error_code": "orphaned",
            "error_detail": "Job exceeded 5 min in processing - server restart or stuck worker.",
        },
    )

    try:
        with TestClient(app) as client:
            res = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF", "application/pdf")},
                headers={"Idempotency-Key": "client-uuid-123"},
            )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "failed"
    assert body["job_id"] is None
    assert body["current_phase"] == "failed"
    assert body["error_code"] == "orphaned"
    assert body["xp_refunded"] is True
    assert state["charged"] == 0


def test_status_endpoint_404_when_not_owner(monkeypatch) -> None:
    _override_principal_and_repo(_FakeCVRepository())
    monkeypatch.setattr(
        cv_workflow.upload_jobs_repo,
        "fetch_status_for_owner",
        lambda *_a, **_k: None,
    )

    try:
        with TestClient(app) as client:
            res = client.get("/cv/upload/status/someone-elses-job")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 404


def test_upload_status_surfaces_current_phase(monkeypatch) -> None:
    """#6 — get_cv_upload_status threads cv_upload_jobs.current_phase to the
    polled payload so the deploy-style loading UI can show the live phase."""
    from app.repositories import cv_upload_jobs

    monkeypatch.setattr(
        cv_upload_jobs, "fetch_status_for_owner",
        lambda _job, _user: {
            "id": "job-1", "status": "processing", "current_phase": "scoring",
            "skills_detected": None, "score": None, "error_code": None,
            "error_detail": None, "xp_charged": 50, "xp_refunded": False,
            "created_at": "2026-05-30T10:00:00+00:00", "finished_at": None,
        },
    )

    async def _bal(_user): return 2950
    monkeypatch.setattr(cv_workflow, "get_xp_balance", _bal)

    payload = asyncio.run(cv_workflow.get_cv_upload_status("job-1", "u1"))
    assert payload["current_phase"] == "scoring"
    assert payload["status"] == "processing"
    assert payload["started_at"] == "2026-05-30T10:00:00+00:00"


def test_upload_status_sweeps_stale_queued_job_before_returning(monkeypatch) -> None:
    """A live worker outage must not leave a polling user stuck in processing
    until the next deploy. Status reads trigger the same bounded orphan sweep
    used on startup, then re-read the job."""
    from app.repositories import cv_upload_jobs

    rows = [
        {
            "id": "job-stale", "status": "processing", "current_phase": "queued",
            "skills_detected": None, "score": None, "error_code": None,
            "error_detail": None, "xp_charged": 200, "xp_refunded": False,
            "created_at": "2026-05-30T10:00:00+00:00", "finished_at": None,
        },
        {
            "id": "job-stale", "status": "failed", "current_phase": "queued",
            "skills_detected": None, "score": None, "error_code": "orphaned",
            "error_detail": "Job exceeded 5 min in processing - server restart or stuck worker.",
            "xp_charged": 200, "xp_refunded": True,
            "created_at": "2026-05-30T10:00:00+00:00", "finished_at": "2026-05-30T10:05:01+00:00",
        },
    ]
    reads = {"count": 0}

    def _fetch(_job, _user):
        idx = min(reads["count"], len(rows) - 1)
        reads["count"] += 1
        return rows[idx]

    swept: list[int] = []
    monkeypatch.setattr(cv_upload_jobs, "fetch_status_for_owner", _fetch)
    monkeypatch.setattr(cv_upload_jobs, "sweep_stale_processing_jobs", lambda minutes=5: swept.append(minutes) or [])

    async def _bal(_user): return 3000
    monkeypatch.setattr(cv_workflow, "get_xp_balance", _bal)
    monkeypatch.setattr(cv_workflow, "_now_utc", lambda: cv_workflow._parse_utc_datetime("2026-05-30T10:07:00+00:00"))

    payload = asyncio.run(cv_workflow.get_cv_upload_status("job-stale", "u1"))

    assert swept == [5]
    assert reads["count"] == 2
    assert payload["status"] == "failed"
    assert payload["current_phase"] == "failed"
    assert payload["error_code"] == "orphaned"
    assert payload["xp_refunded"] is True
