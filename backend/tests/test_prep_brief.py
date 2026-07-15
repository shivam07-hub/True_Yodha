"""Preparations day-of brief — grounded service parse + the 30-coin router
contract (cached replay free, charge-on-success, coverage grounding)."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services import jd_coverage, prep_brief, xp_policy, xp_service
from app.services.jd_coverage import CoverageItem
from app.services.llm_provider import get_llm_provider


class _StubProvider:
    def __init__(self, reply: str):
        self._reply = reply
        self.messages: list[dict] | None = None
        self.calls = 0

    async def complete(self, messages, max_tokens=900, temperature=None):
        self.calls += 1
        self.messages = messages
        return self._reply


_ROWS = [
    CoverageItem(requirement="Own enterprise quota", status="covered",
                 story_id="s1", story_title="Beat $2M quota", story_pointer="Beat quota 120%"),
    CoverageItem(requirement="Design incentive plans", status="weak",
                 story_id="s2", story_title="Comp plan build"),
    CoverageItem(requirement="Rust systems programming", status="gap"),
]

_GOOD_REPLY = json.dumps({
    "snapshot": "A sales strategy manager role owning enterprise quota.",
    "leads": [{"story": "Beat $2M quota", "why": "Directly proves the quota requirement."}],
    "likely_questions": ["Walk me through how you beat your quota.",
                         "How would you design an incentive plan?",
                         "Tell me about a transformation you led.",
                         "How do you plan a territory?"],
    "watch_out": "Rust systems programming is uncovered — say you are learning it.",
    "plan": ["Re-read your quota story.", "Lead with numbers.", "Send a thank-you note."],
})


# ── service ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_brief_grounds_on_jd_and_coverage():
    provider = _StubProvider(_GOOD_REPLY)
    brief = await prep_brief.build_prep_brief(
        role="Manager, Sales Strategy", company="Deloitte",
        jd_text="Own quota. Design incentives. Rust required.",
        coverage_rows=_ROWS, provider=provider,
    )
    assert brief is not None
    assert brief["snapshot"]
    assert len(brief["likely_questions"]) == 4
    ctx = provider.messages[1]["content"]
    # Grounding: the JD, the covered story, and the honest NOT COVERED marker all
    # reached the model — the brief can only restate what Myro actually holds.
    assert "Deloitte" in ctx
    assert "Beat $2M quota" in ctx
    assert "[NOT COVERED] Rust systems programming" in ctx


@pytest.mark.asyncio
async def test_unparseable_or_empty_reply_is_none():
    assert await prep_brief.build_prep_brief(
        role="x", company="y", jd_text="long enough jd",
        coverage_rows=_ROWS, provider=_StubProvider("cannot help"),
    ) is None
    assert await prep_brief.build_prep_brief(
        role="x", company="y", jd_text="long enough jd",
        coverage_rows=_ROWS,
        provider=_StubProvider(json.dumps({"snapshot": "", "likely_questions": []})),
    ) is None


@pytest.mark.asyncio
async def test_none_provider_and_nothing_to_ground_on():
    assert await prep_brief.build_prep_brief(
        role="x", company="y", jd_text="jd", coverage_rows=_ROWS, provider=None,
    ) is None
    assert await prep_brief.build_prep_brief(
        role="x", company="y", jd_text="  ", coverage_rows=[], provider=_StubProvider(_GOOD_REPLY),
    ) is None


def test_parse_brief_caps_lists():
    obj = json.loads(_GOOD_REPLY)
    obj["likely_questions"] = [f"Q{i}" for i in range(10)]
    obj["leads"] = [{"story": f"S{i}"} for i in range(6)]
    obj["plan"] = [f"P{i}" for i in range(6)]
    out = prep_brief.parse_brief(json.dumps(obj))
    assert len(out["likely_questions"]) == 6
    assert len(out["leads"]) == 3
    assert len(out["plan"]) == 3


# ── router ─────────────────────────────────────────────────────────────────────

class _FakeRepo:
    def __init__(self, *, deepenings: dict[str, str] | None = None):
        self.deepenings = dict(deepenings or {})
        self.upserts: list[tuple[str, str]] = []

    def get_deepening(self, _u: str, _j: str, key: str) -> str | None:
        return self.deepenings.get(key)

    def upsert_deepening(self, _u: str, _j: str, key: str, text: str) -> None:
        self.deepenings[key] = text
        self.upserts.append((key, text))

    def get_jobs_by_ids(self, _ids: list[str]) -> list[dict]:
        return [{"job_title": "Manager", "company_name": "Deloitte",
                 "job_description": "Own quota. Design incentives."}]


_COVERAGE_PAYLOAD = json.dumps({
    "computed_at": "2026-07-15T00:00:00+00:00",
    "covered": 1, "weak": 0, "gap": 1,
    "requirements": [
        {"requirement": "Own enterprise quota", "status": "covered",
         "story_id": "s1", "story_title": "Beat $2M quota", "story_pointer": "", "similarity": 0.85},
        {"requirement": "Rust systems", "status": "gap",
         "story_id": None, "story_title": "", "story_pointer": "", "similarity": 0.0},
    ],
})


def _client(repo: _FakeRepo, provider: _StubProvider) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="t@e.com")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_llm_provider] = lambda: provider
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _aconst(value):
    async def _f(*_a, **_kw):
        return value
    return _f


def _araise(exc):
    async def _f(*_a, **_kw):
        raise exc
    return _f


def test_get_replays_purchased_brief_free(monkeypatch):
    repo = _FakeRepo(deepenings={"prep_brief": json.dumps(prep_brief.parse_brief(_GOOD_REPLY))})
    resp = _client(repo, _StubProvider("unused")).get("/jobs/j1/prep/brief")
    assert resp.status_code == 200
    body = resp.json()
    assert body["purchased"] is True
    assert body["brief"]["snapshot"]
    assert body["cost"] == xp_policy.PREP_BRIEF_XP_COST


def test_get_without_purchase_is_unpurchased():
    resp = _client(_FakeRepo(), _StubProvider("unused")).get("/jobs/j1/prep/brief")
    assert resp.status_code == 200
    assert resp.json() == {"purchased": False, "brief": None,
                           "cost": xp_policy.PREP_BRIEF_XP_COST, "new_coin_balance": None}


def test_post_charges_on_success_and_caches(monkeypatch):
    repo = _FakeRepo(deepenings={jd_coverage.CACHE_PROMPT_KEY: _COVERAGE_PAYLOAD})
    provider = _StubProvider(_GOOD_REPLY)
    charged: list[tuple] = []

    async def _charge(user_id, amount, action, **kw):
        charged.append((user_id, amount, action, kw.get("ref_id")))
        return 2970

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _aconst(None))
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)

    resp = _client(repo, provider).post("/jobs/j1/prep/brief")
    assert resp.status_code == 200
    body = resp.json()
    assert body["purchased"] is True
    assert body["new_coin_balance"] == 2970
    assert charged == [("u1", xp_policy.PREP_BRIEF_XP_COST, "prep_brief", "j1:prep_brief")]
    assert "prep_brief" in repo.deepenings
    # Grounded on the CACHED coverage — the [NOT COVERED] gap reached the model.
    assert "[NOT COVERED] Rust systems" in provider.messages[1]["content"]


def test_post_provider_failure_is_503_and_never_charges(monkeypatch):
    repo = _FakeRepo(deepenings={jd_coverage.CACHE_PROMPT_KEY: _COVERAGE_PAYLOAD})
    charged: list = []

    async def _charge(*a, **kw):
        charged.append(a)
        return 0

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _aconst(None))
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)

    resp = _client(repo, _StubProvider("no json here")).post("/jobs/j1/prep/brief")
    assert resp.status_code == 503
    assert charged == []
    assert "prep_brief" not in repo.deepenings


def test_post_replays_cached_purchase_without_charging(monkeypatch):
    repo = _FakeRepo(deepenings={"prep_brief": json.dumps(prep_brief.parse_brief(_GOOD_REPLY))})
    charged: list = []

    async def _charge(*a, **kw):
        charged.append(a)
        return 0

    monkeypatch.setattr(xp_service, "get_xp_balance", _aconst(3000))
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)

    resp = _client(repo, _StubProvider("unused")).post("/jobs/j1/prep/brief")
    assert resp.status_code == 200
    assert resp.json()["new_coin_balance"] == 3000
    assert charged == []


def test_post_computes_coverage_inline_on_cache_miss(monkeypatch):
    repo = _FakeRepo()  # no cached coverage
    provider = _StubProvider(_GOOD_REPLY)

    async def _assess(user_id, jd_text, _provider):
        return jd_coverage.CoverageResult(
            requirements=[CoverageItem(requirement="Own quota", status="gap")],
            covered=0, weak=0, gap=1,
        )

    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _aconst(None))
    monkeypatch.setattr(xp_service, "charge_or_raise", _aconst(2970))
    monkeypatch.setattr(jd_coverage, "assess", _assess)

    resp = _client(repo, provider).post("/jobs/j1/prep/brief")
    assert resp.status_code == 200
    # The inline compute was cached for the room too.
    assert jd_coverage.CACHE_PROMPT_KEY in repo.deepenings


def test_post_insufficient_coins_is_402(monkeypatch):
    repo = _FakeRepo(deepenings={jd_coverage.CACHE_PROMPT_KEY: _COVERAGE_PAYLOAD})
    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _aconst(None))
    monkeypatch.setattr(
        xp_service, "charge_or_raise",
        _araise(xp_service.InsufficientXPError(
            amount=xp_policy.PREP_BRIEF_XP_COST, balance=5, action="prep_brief")),
    )
    resp = _client(repo, _StubProvider(_GOOD_REPLY)).post("/jobs/j1/prep/brief")
    assert resp.status_code == 402
