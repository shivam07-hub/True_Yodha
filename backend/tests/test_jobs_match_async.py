from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers.jobs import match as match_router


def _auth_override() -> dict[str, str]:
    return {"user_id": "user-123", "token": "token-123", "email": "user@example.com"}


def test_compute_enqueues_and_returns_accepted_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        match_router.job_match_compute_async,
        "enqueue_compute_job",
        lambda user_id, batch_week: {
            "status": "queued",
            "already_running": False,
            "job_id": "job-abc",
            "message": "Queued background jobs compute.",
            "matches_written": None,
            "from_cache": None,
            "needs_onboarding": None,
            "debug": None,
        },
    )

    app.dependency_overrides[get_current_user] = _auth_override
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/compute")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["already_running"] is False
    assert body["job_id"] == "job-abc"
    assert body["matches_written"] == 0
    assert body["from_cache"] is False


def test_compute_status_reads_status_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(
        match_router.job_match_compute_async,
        "get_status",
        lambda user_id, batch_week: {
            "user_id": user_id,
            "batch_week": str(batch_week),
            "status": "running",
            "job_id": "job-abc",
            "already_running": True,
            "matches_written": None,
            "from_cache": None,
            "needs_onboarding": None,
            "debug": None,
            "message": "Computing matched jobs.",
            "error": None,
            "enqueued_at": "2026-05-07T00:00:00+00:00",
            "started_at": "2026-05-07T00:00:01+00:00",
            "finished_at": None,
        },
    )

    app.dependency_overrides[get_current_user] = _auth_override
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/compute/status")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert body["already_running"] is True
    assert body["job_id"] == "job-abc"


def test_refresh_preflights_xp_and_passes_charge_policy_to_queue(monkeypatch) -> None:
    class _Repo:
        def get_existing_match_job_ids(self, user_id, batch_week):
            return ["job-1", "job-2"]

    calls: dict[str, object] = {}

    async def _can_spend(user_id: str, amount: int, action: str) -> int:
        calls["preflight"] = (user_id, amount, action)
        return 100

    def _enqueue(user_id, batch_week, *, excluded_job_ids=None, charge_xp_amount=0):
        calls["enqueue"] = (user_id, list(excluded_job_ids or []), charge_xp_amount)
        return {
            "status": "queued",
            "already_running": False,
            "job_id": "job-refresh",
            "message": "Queued background jobs compute.",
            "matches_written": None,
            "from_cache": None,
            "needs_onboarding": None,
            "debug": None,
        }

    monkeypatch.setattr(match_router.settings, "redis_url", "redis://example.test/0")
    monkeypatch.setattr(match_router.xp_service, "assert_can_spend_xp", _can_spend)
    monkeypatch.setattr(match_router.job_match_compute_async, "enqueue_compute_job", _enqueue)

    app.dependency_overrides[get_current_user] = _auth_override
    app.dependency_overrides[match_router.get_token_jobs_repository] = lambda: _Repo()
    try:
        with TestClient(app) as client:
            response = client.post("/jobs/refresh")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert calls["preflight"] == ("user-123", 50, "refresh_matches")
    assert calls["enqueue"] == ("user-123", ["job-1", "job-2"], 50)
