"""Collections asks Verdict Currency (#55 S2).

An untouched Myro match judged for another CV or direction is not this person's
to work on, so it earns no entry. A saved job stays theirs whatever its verdict
was judged for — the save is the person's own act.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.services import onboarding_service

_DIRECTION = {"target_role_title": "Data Analyst", "target_seniority": "mid", "target_location": "Pune"}
_LEFT = {**_DIRECTION, "target_role_title": "Sales Manager"}


def _match(job_id: str, profile: dict, *, eval_hash: str | None = None) -> dict:
    keyed = {**profile, "baseline_version_id": 7}
    return {
        "id": 1,
        "job_id": job_id,
        "overall_score": 4.4,
        "recommendation": "Apply",
        "eval_context_hash": eval_hash or onboarding_service.eval_context_key(keyed),
        "target_context_hash": onboarding_service.context_key(keyed),
        "jobs": {"job_title": job_id, "company_name": "Acme", "is_active": True, "listing_confidence": "active"},
    }


class _Repo:
    def __init__(self, stack: list[dict], applications: list[dict]) -> None:
        self._stack = stack
        self._applications = applications

    def get_user_applications(self, _uid):
        return self._applications

    def get_dismissed_job_card_ids(self, _uid):
        return []

    def get_pending_apply_intent_job_ids(self, _uid, *, older_than, newer_than):
        return set()

    def match_freshness_inputs(self, _uid):
        return {}

    def get_user_match_stack(self, _uid, *, dismissed=None):
        return self._stack

    def get_direction_columns(self, _uid):
        return dict(_DIRECTION)

    def get_latest_baseline_id(self, _uid):
        return 7


class _CVRepo:
    def latest_for_jobs(self, _uid, job_ids=None):
        return {}


def _collection(stack: list[dict], applications: list[dict] | None = None) -> dict:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: _Repo(stack, applications or [])
    app.dependency_overrides[get_token_cv_repository] = lambda: _CVRepo()
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/collections")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    return response.json()


def test_an_untouched_match_from_a_left_direction_earns_no_entry() -> None:
    body = _collection([
        _match("now", _DIRECTION),
        _match("older-prompt", _DIRECTION, eval_hash="an-older-prompt"),
        _match("left", _LEFT),
    ])
    assert sorted(e["job_id"] for e in body["entries"]) == ["now", "older-prompt"]


def test_a_saved_job_stays_whatever_its_verdict_was_judged_for() -> None:
    saved = {"id": 1, "job_id": "left", "status": "saved", "source": "user_discovery",
             "created_at": "2026-10-01T08:00:00+00:00", "jobs": _match("left", _LEFT)["jobs"]}
    body = _collection([_match("left", _LEFT)], [saved])
    assert [(e["job_id"], e["stage"], e["origin"]) for e in body["entries"]] == [("left", "saved", "myro")]
