"""Reach search router — free, auth-gated, no coin charge, no persist.

Also guards the 50-coin pack against the charge rule (CONTEXT.md "Coin balance"):
coins are charged only if the LLM was charged, so a provider that returns nothing
usable must cost the user nothing. Every other paid surface asserts this
(`test_post_provider_failure_is_503_and_never_charges`, the analyse-stream and
deepen equivalents); the pack was the one paid route with no router test at all.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.connections import get_token_connections_repository
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.services import xp_service
from app.services.llm_provider import get_llm_provider


def _client() -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="n@example.com")
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_reach_search_returns_deterministic_searches():
    client = _client()
    resp = client.post(
        "/jobs/reach/search",
        json={
            "job_title": "Netscribes - Manager - Presales - Data Analytics",
            "company": "Netscribes",
            "job_description": "Role : Presales\nReporting to : VP\nEngage with clients.",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reporting_target"] == "VP"
    assert body["primary"]["kind"] == "linkedin"
    assert "linkedin.com/search/results/people" in body["primary"]["url"]
    assert body["target_titles"]


def test_reach_search_requires_auth():
    app.dependency_overrides.clear()
    client = TestClient(app)
    resp = client.post("/jobs/reach/search", json={"job_title": "x", "company": "y"})
    assert resp.status_code in (401, 403)


def test_reach_search_empty_body_is_graceful():
    client = _client()
    resp = client.post("/jobs/reach/search", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["primary"] is None
    assert body["alternates"] == []


class _FakeJobsRepo:
    def __init__(self) -> None:
        self.deepenings: dict[str, str] = {}

    def get_deepening(self, _user_id: str, _job_id: str, key: str):
        return self.deepenings.get(key)

    def get_jobs_by_ids(self, _job_ids: list[str]) -> list[dict]:
        return [{
            "job_title": "Manager, Presales",
            "company_name": "Netscribes",
            "job_description": "Engage with clients. Reporting to : VP",
        }]

    def upsert_deepening(self, _user_id: str, _job_id: str, key: str, value: str) -> None:
        self.deepenings[key] = value


class _FakeCVRepo:
    def latest_baseline(self, _user_id: str) -> dict:
        return {"cv_structured": {}, "body_text": "Ran presales for a data analytics team."}


class _FakeConnectionsRepo:
    def find_at_company(self, _user_id: str, _company: str, limit: int = 1) -> list[dict]:
        return []


class _DeadProvider:
    """Answers, but with nothing the pack parser can use — the realistic failure.
    A hard provider error is already covered by the service-level tests."""

    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, _messages, max_tokens=900, temperature=None):
        self.calls += 1
        return "no json here"


def test_reach_pack_provider_failure_is_503_and_never_charges(monkeypatch):
    repo = _FakeJobsRepo()
    charged: list = []

    async def _charge(*a, **kw):
        charged.append(a)
        return 0

    async def _assert_can_spend(*_a, **_kw):
        return None

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _assert_can_spend)
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)

    provider = _DeadProvider()
    client = _client()
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: _FakeCVRepo()
    app.dependency_overrides[get_token_connections_repository] = lambda: _FakeConnectionsRepo()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    resp = client.post("/jobs/j1/reach/pack")

    assert resp.status_code == 503
    # Non-vacuous: the route really did reach the model and come back empty-handed,
    # rather than 503-ing somewhere earlier for an unrelated reason.
    assert provider.calls == 1
    # The whole point: no deliverable, no LLM value delivered, no coins taken.
    assert charged == []
    assert repo.deepenings == {}
