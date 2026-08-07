"""Tests for routers/public.py — POST /public/job-search (anon job-gen search).

Covers:
- happy path: NL query → 200 with real cards + interpreted filters
- closest-rec relaxation surfaces in the `relaxed` field
- too-short query → 422 (never reaches the LLM/feed)
- per-IP rate limit: the (N+1)th call in a window → 429
The NL parse + feed query are monkeypatched — this asserts the router's guards,
shaping, and response contract, NOT the LLM or the live feed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import public as public_router
from app.security import anon_rate_limit


@pytest.fixture(autouse=True)
def _reset_rate_limit_and_turnstile(monkeypatch: pytest.MonkeyPatch):
    anon_rate_limit.reset()
    monkeypatch.setattr(public_router.settings, "turnstile_secret", "", raising=False)
    yield
    anon_rate_limit.reset()


class _FakeRepo:
    def __init__(self, result):
        self._result = result

    def public_job_query(self, **_kwargs):
        return self._result


def _wire(monkeypatch, *, filters, result):
    async def _fake_parse(_query, _provider):
        return filters

    monkeypatch.setattr(public_router.job_query_parser, "parse_job_query", _fake_parse)
    monkeypatch.setattr(public_router, "get_llm_provider", lambda: object())
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: _FakeRepo(result))


def test_job_search_happy_path(monkeypatch: pytest.MonkeyPatch):
    _wire(
        monkeypatch,
        filters={
            "role": "product manager",
            "location_city": "Bangalore",
            "location_country": None,
            "location_mode": None,
            "skills": ["roadmapping"],
        },
        result={
            "rows": [
                {
                    "job_id": "j1",
                    "job_title": "Product Manager",
                    "company_name": "Acme",
                    "location": "Bangalore, India",
                    "location_city": "Bangalore",
                    "location_country": "India",
                    "location_mode": "onsite",
                    "first_seen": "2026-06-20T00:00:00Z",
                }
            ],
            "total": 1,
            "relaxed": [],
        },
    )
    client = TestClient(app)
    resp = client.post("/public/job-search", json={"query": "product roles in Bangalore"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["cards"][0]["job_id"] == "j1"
    assert body["cards"][0]["title"] == "Product Manager"
    assert body["interpreted"]["role"] == "product manager"
    assert body["interpreted"]["location_city"] == "Bangalore"
    assert body["relaxed"] == []


def test_job_search_reports_relaxed(monkeypatch: pytest.MonkeyPatch):
    _wire(
        monkeypatch,
        filters={
            "role": "data scientist",
            "location_city": "Indore",
            "location_country": None,
            "location_mode": None,
            "skills": [],
        },
        result={
            "rows": [
                {"job_id": "j9", "job_title": "Data Scientist", "company_name": "Globex"}
            ],
            "total": 1,
            "relaxed": ["location"],
        },
    )
    client = TestClient(app)
    resp = client.post("/public/job-search", json={"query": "data science roles in Indore"})
    assert resp.status_code == 200
    assert resp.json()["relaxed"] == ["location"]


def test_job_search_rejects_short_query(monkeypatch: pytest.MonkeyPatch):
    # No wiring needed — the guard fires before parse/feed.
    client = TestClient(app)
    resp = client.post("/public/job-search", json={"query": "a"})
    assert resp.status_code == 422


def test_job_search_rate_limited(monkeypatch: pytest.MonkeyPatch):
    _wire(
        monkeypatch,
        filters={"role": "engineer", "location_city": None, "location_country": None, "location_mode": None, "skills": []},
        result={"rows": [], "total": 0, "relaxed": []},
    )
    client = TestClient(app)
    limit = anon_rate_limit.MAX_PER_WINDOW["job_search"]
    for _ in range(limit):
        assert client.post("/public/job-search", json={"query": "software engineer"}).status_code == 200
    # (N+1)th call in the window → 429
    assert client.post("/public/job-search", json={"query": "software engineer"}).status_code == 429
