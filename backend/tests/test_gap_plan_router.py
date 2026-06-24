"""POST /cv/{job_id}/gap-plan — router wiring + branch coverage.

The plan logic is exhaustively covered in test_gap_planner.py (pure). Here we
pin the glue: 404 (job gone), 409 (no structured CV), and one happy path that
fans a latent + absent + below-level + flywheel gap through the real planner via
fake repos and a fake LLM (so no real provider is hit).
"""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.routers.cv import gap_plan as gap_plan_module


class _FakeJobsRepo:
    def __init__(self, job=None):
        self._job = job

    def get_job_skills(self, job_id):
        return self._job

    def get_user_skill_map(self, user_id):
        return {"python": 2}  # python L2; sprint_planning + content_dev absent

    def get_gap_skill_context(self, user_id, keys):
        names = {
            "sprint_planning": "Sprint Planning",
            "content_dev": "Content Development",
            "python": "Python",
        }
        assessed = {"python": 4}  # practice proved L4 → flywheel upgrade offer
        return {
            k: {"display_name": names.get(k, k), "assessed_level": assessed.get(k, 0)}
            for k in keys
        }


class _FakeCVRepo:
    def __init__(self, structured=None):
        self._structured = structured

    def latest_baseline(self, user_id):
        if self._structured is None:
            return None
        return {"id": 1, "cv_structured": self._structured}


class _FakeProvider:
    def __init__(self, reply):
        self._reply = reply

    async def complete(self, messages, max_tokens=None):
        return self._reply


_JOB = {
    "job_id": "job1",
    "job_title": "Consultant",
    "company_name": "Cognizant",
    "skills": [
        {"taxonomy_key": "sprint_planning", "is_primary": True, "required_level": 4},
        {"taxonomy_key": "content_dev", "is_primary": True, "required_level": 4},
        {"taxonomy_key": "python", "is_primary": True, "required_level": 4},
    ],
}
_STRUCTURED = {
    "experience": [
        {"role": "PM", "company": "Acme", "bullets": ["Managed delivery across two teams"]},
    ],
}


def _override(jobs_repo, cv_repo):
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="x@y.com")
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs_repo
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo


def teardown_function():
    app.dependency_overrides.clear()


def test_job_not_found_404():
    _override(_FakeJobsRepo(job=None), _FakeCVRepo(_STRUCTURED))
    resp = TestClient(app).post("/cv/job1/gap-plan")
    assert resp.status_code == 404


def test_no_structured_cv_409():
    _override(_FakeJobsRepo(job=_JOB), _FakeCVRepo(structured=None))
    resp = TestClient(app).post("/cv/job1/gap-plan")
    assert resp.status_code == 409


def test_happy_path_fans_gap_types(monkeypatch):
    _override(_FakeJobsRepo(job=_JOB), _FakeCVRepo(_STRUCTURED))
    # LLM tags sprint_planning latent on bullet 0, content_dev absent.
    reply = json.dumps({"classifications": [
        {"skill": "sprint_planning", "verdict": "latent", "host_bullet": 0},
        {"skill": "content_dev", "verdict": "absent", "host_bullet": None},
    ]})
    monkeypatch.setattr(gap_plan_module, "get_interactive_provider", lambda: _FakeProvider(reply))

    resp = TestClient(app).post("/cv/job1/gap-plan")
    assert resp.status_code == 200
    body = resp.json()

    # latent → host bullet card
    assert len(body["host_bullet_cards"]) == 1
    assert body["host_bullet_cards"][0]["skills"][0]["display_name"] == "Sprint Planning"
    # absent → Forge list
    assert [a["display_name"] for a in body["absent_skills"]] == ["Content Development"]
    # python L2 vs required L4 → below-level card, surface one notch to L3
    assert len(body["below_level_cards"]) == 1
    assert body["below_level_cards"][0]["surface_to"] == 3
    # python practice-proven L4 > CV L2 → flywheel upgrade offer
    assert any(u["skill"] == "python" and u["to_level"] == 4 for u in body["upgrade_offers"])
    assert body["company"] == "Cognizant"
