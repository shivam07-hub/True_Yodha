from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from app.services import onboarding_first_role, onboarding_service


class _JobsRepo:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.writes: list[tuple[str, str, dict[str, Any]]] = []

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        # The context-blind durable stack. Commit must NOT read this: it answers
        # "every job Myro ever matched you to", which is not "your current
        # shortlist", and serving one for the other is what let a previous
        # direction's card be offered and then refused.
        raise AssertionError("commit_first_role must resolve the shortlist by context")

    def get_matches_for_context(
        self,
        _user_id: str,
        baseline_version_id: int,
        context_hash: str,
        *,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        return [
            row
            for row in self.rows
            if int(row.get("baseline_version_id") or 0) == baseline_version_id
            and str(row.get("target_context_hash") or "") == context_hash
        ][:limit]

    def upsert_application(self, user_id: str, job_id: str, payload: dict[str, Any]) -> None:
        self.writes.append((user_id, job_id, payload))

    def get_application_with_job(self, _user_id: str, job_id: str) -> dict[str, Any] | None:
        return {"job_id": job_id} if self.writes else None

    def get_user_applications(self, _user_id: str) -> list[dict[str, Any]]:
        return []


class _OnboardingRepo:
    def __init__(self) -> None:
        self.milestones: list[tuple[str, str]] = []

    def mark_milestone(self, user_id: str, milestone: str) -> None:
        self.milestones.append((user_id, milestone))


def _ready_result() -> dict[str, Any]:
    return {
        "kind": "full_result_ready",
        "baseline_version_id": 17,
        "target_context_hash": "context-1",
    }


def test_commit_first_role_persists_current_match_before_completion(monkeypatch) -> None:
    jobs = _JobsRepo([{
        "job_id": "job/7",
        "baseline_version_id": 17,
        "target_context_hash": "context-1",
    }])
    state = _OnboardingRepo()
    completed: list[str] = []
    monkeypatch.setattr(onboarding_first_role.onboarding_service, "get_result", lambda *_a: _ready_result())
    monkeypatch.setattr(onboarding_first_role.onboarding_service, "mark_completed", lambda _db, user_id: completed.append(user_id))
    monkeypatch.setattr(onboarding_first_role, "OnboardingRepository", lambda _db: state)

    receipt = onboarding_first_role.commit_first_role(object(), jobs, "u1", "job/7")

    assert jobs.writes == [("u1", "job/7", {"status": "saved", "source": "onboarding_shortlist"})]
    assert state.milestones == [("u1", "credible_job_saved")]
    assert completed == ["u1"]
    assert receipt == {"status": "saved", "job_id": "job/7", "tailor_href": "/cv?jobId=job%2F7"}


def test_commit_first_role_rejects_a_stale_or_unmatched_job(monkeypatch) -> None:
    jobs = _JobsRepo([{
        "job_id": "old-job",
        "baseline_version_id": 16,
        "target_context_hash": "old-context",
    }])
    monkeypatch.setattr(onboarding_first_role.onboarding_service, "get_result", lambda *_a: _ready_result())

    with pytest.raises(HTTPException) as exc:
        onboarding_first_role.commit_first_role(object(), jobs, "u1", "old-job")

    assert exc.value.status_code == 409
    assert jobs.writes == []


def test_commit_first_role_rejects_a_current_match_outside_the_presented_top_three(monkeypatch) -> None:
    jobs = _JobsRepo([
        {
            "job_id": f"job-{index}",
            "baseline_version_id": 17,
            "target_context_hash": "context-1",
        }
        for index in range(1, 5)
    ])
    monkeypatch.setattr(onboarding_first_role.onboarding_service, "get_result", lambda *_a: _ready_result())

    with pytest.raises(HTTPException) as exc:
        onboarding_first_role.commit_first_role(object(), jobs, "u1", "job-4")

    assert exc.value.status_code == 409
    assert jobs.writes == []


def test_saved_first_role_rebuilds_the_receipt_after_reload() -> None:
    jobs = _JobsRepo([])
    jobs.get_user_applications = lambda _user_id: [{
        "job_id": "job/7",
        "source": "onboarding_shortlist",
        "jobs": {"job_title": "Data Analyst", "company_name": "Acme"},
    }]

    assert onboarding_first_role.saved_first_role(jobs, "u1") == {
        "job_id": "job/7",
        "title": "Data Analyst",
        "company": "Acme",
        "tailor_href": "/cv?jobId=job%2F7",
    }


def test_onboarding_result_recovers_saved_receipt_after_reload(monkeypatch) -> None:
    state = {"completed_at": "now", "credible_job_saved_at": "now"}
    monkeypatch.setattr(
        onboarding_service,
        "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service,
        "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: {}})(),
    )
    monkeypatch.setattr(
        onboarding_service,
        "CVVersionsRepository",
        lambda _db: type("CV", (), {"latest_baseline": lambda _self, _uid: {"id": 17}})(),
    )
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: object())
    monkeypatch.setattr(
        onboarding_first_role,
        "saved_first_role",
        lambda _repo, _uid: {
            "job_id": "job-7",
            "title": "Data Analyst",
            "company": "Acme",
            "tailor_href": "/cv?jobId=job-7",
        },
    )

    assert onboarding_service.get_result(object(), "u1") == {
        "kind": "first_role_saved",
        "job_id": "job-7",
        "title": "Data Analyst",
        "company": "Acme",
        "tailor_href": "/cv?jobId=job-7",
    }
