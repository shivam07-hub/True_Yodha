"""Reach search router — free, auth-gated, no coin charge, no persist."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app


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
