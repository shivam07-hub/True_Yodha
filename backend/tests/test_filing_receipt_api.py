"""A receipt marks the job applied only after the Yes still holds and the host matches."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.job_filing import get_job_filing_repository
from app.repositories.jobs import get_token_jobs_repository
from app.routers.jobs import filing as filing_router
from app.services.apply_filing import FilingFacts


class _FilingRepo:
    def __init__(self, facts: FilingFacts | None, *, cv_id: int = 9) -> None:
        self._facts = facts
        self.row: dict[str, Any] | None = {
            "user_id": "user-1",
            "job_id": "job-1",
            "cv_version_id": cv_id,
            "judge_score": 4.0,
            "received_at": None,
            "hold_reason": None,
        }
        self.receipts: list[dict[str, Any]] = []
        self.holds: list[str | None] = []
        self.cv = {
            "id": cv_id,
            "cv_structured": {
                "contact": {"name": "Asha Rao", "email": "asha@example.com"},
                "summary": "Analyst who built the weekly SQL report.",
            },
            "body_text": "",
        }

    def facts(self, user_id: str, job_id: str) -> FilingFacts | None:
        _ = (user_id, job_id)
        return self._facts

    def authorization_for(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        _ = (user_id, job_id)
        return self.row

    def save_receipt(self, **kwargs: Any) -> None:
        self.receipts.append(kwargs)
        if self.row is not None:
            self.row["received_at"] = "now"
            self.row["hold_reason"] = None

    def save_hold(self, **kwargs: Any) -> None:
        self.holds.append(kwargs.get("reason"))
        if self.row is not None:
            self.row["hold_reason"] = kwargs.get("reason")

    def tailored_cv(self, user_id: str, cv_version_id: int) -> dict[str, Any] | None:
        _ = (user_id, cv_version_id)
        return self.cv

    def save_authorization(self, **kwargs: Any) -> None:
        _ = kwargs


class _Jobs:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []
        self.answered: list[str] = []

    def get_application_with_job(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        _ = (user_id, job_id)
        return None

    def upsert_application(self, user_id: str, job_id: str, updates: dict[str, Any]) -> None:
        _ = (user_id, job_id)
        self.updates.append(updates)

    def answer_apply_intents(self, user_id: str, job_id: str) -> None:
        _ = user_id
        self.answered.append(job_id)


def _live(**extra: object) -> dict:
    at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    row = {
        "is_active": True,
        "listing_confidence": "active",
        "last_verified_live_at": at,
        "last_conclusive_verification_at": at,
        "reactivated_at": at,
        "apply_url": "https://careers.example.com/jobs/1",
        "source_url": "https://careers.example.com/jobs/1",
    }
    row.update(extra)
    return row


def _bind(repo: _FilingRepo, jobs: _Jobs) -> None:
    app.dependency_overrides[get_job_filing_repository] = lambda: repo
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1", email=None)


def test_a_company_page_receipt_marks_the_job_applied(monkeypatch) -> None:
    recorded: list[str] = []
    monkeypatch.setattr(filing_router.cv_of_record, "record_on_apply", lambda *_a, **_k: recorded.append("cv"))
    monkeypatch.setattr(filing_router.on_demand, "open_job_eval", lambda *_a, **_k: recorded.append("eval"))
    monkeypatch.setattr(
        filing_router.core_loop,
        "record_step",
        lambda *_a, **_k: recorded.append("step"),
    )
    repo = _FilingRepo(FilingFacts(listing=_live(), judge_score=4.0, tailored_cv_id=9))
    jobs = _Jobs()
    _bind(repo, jobs)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/jobs/job-1/filing/receipt",
                json={
                    "receipt_url": "https://careers.example.com/thanks",
                    "receipt_text": "Application submitted. Thank you.",
                },
            )
        assert res.status_code == 200
        assert res.json()["applied"] is True
        assert jobs.updates[0]["status"] == "applied"
        assert jobs.answered == ["job-1"]
        assert repo.receipts
        assert "cv" in recorded
        assert "step" in recorded
    finally:
        app.dependency_overrides.clear()


def test_a_receipt_from_another_host_does_not_mark_applied() -> None:
    repo = _FilingRepo(FilingFacts(listing=_live(), judge_score=4.0, tailored_cv_id=9))
    jobs = _Jobs()
    _bind(repo, jobs)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/jobs/job-1/filing/receipt",
                json={
                    "receipt_url": "https://linkedin.com/jobs/1",
                    "receipt_text": "Application submitted. Thank you.",
                },
            )
        assert res.status_code == 200
        assert res.json()["applied"] is False
        assert res.json()["blocks"] == ["receipt_host"]
        assert jobs.updates == []
        assert repo.receipts == []
    finally:
        app.dependency_overrides.clear()


def test_a_closed_listing_does_not_accept_a_receipt() -> None:
    listing = _live(listing_confidence="closed")
    repo = _FilingRepo(FilingFacts(listing=listing, judge_score=4.0, tailored_cv_id=9))
    jobs = _Jobs()
    _bind(repo, jobs)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/jobs/job-1/filing/receipt",
                json={
                    "receipt_url": "https://careers.example.com/thanks",
                    "receipt_text": "Application submitted. Thank you.",
                },
            )
        assert res.json()["applied"] is False
        assert "listing_closed" in res.json()["blocks"]
        assert jobs.updates == []
    finally:
        app.dependency_overrides.clear()


def test_a_hold_does_not_mark_the_job_applied() -> None:
    repo = _FilingRepo(FilingFacts(listing=_live(), judge_score=4.0, tailored_cv_id=9))
    jobs = _Jobs()
    _bind(repo, jobs)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/job-1/filing/hold", json={"reason": "captcha"})
        assert res.status_code == 200
        assert res.json()["hold_reason"] == "captcha"
        assert jobs.updates == []
        assert repo.holds == ["captcha"]
    finally:
        app.dependency_overrides.clear()


def test_answers_copy_the_email_and_hold_when_the_writer_is_blank(monkeypatch) -> None:
    async def complete(_messages: list[dict[str, str]]) -> str:
        return "BLANK"

    monkeypatch.setattr(filing_router, "_complete", complete)
    repo = _FilingRepo(FilingFacts(listing=_live(), judge_score=4.0, tailored_cv_id=9))
    jobs = _Jobs()
    _bind(repo, jobs)
    try:
        with TestClient(app) as client:
            res = client.post(
                "/jobs/job-1/filing/answers",
                json={
                    "questions": [
                        {"id": "email", "label": "Email"},
                        {"id": "why", "label": "Why this role?"},
                    ]
                },
            )
        body = res.json()
        assert res.status_code == 200
        assert body["answers"][0]["answer"] == "asha@example.com"
        assert body["answers"][0]["source"] == "cv"
        assert body["answers"][1]["answer"] == ""
        assert repo.holds == ["unanswered"]
        assert jobs.updates == []
    finally:
        app.dependency_overrides.clear()
