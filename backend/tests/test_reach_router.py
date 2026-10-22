"""Reach search router — free, auth-gated, no coin charge, no persist.

Also guards the 50-coin pack against the charge rule (CONTEXT.md "Coin balance"):
coins are charged only if the LLM was charged, so a provider that returns nothing
usable must cost the user nothing. Every other paid surface asserts this
(`test_post_provider_failure_is_503_and_never_charges`, the analyse-stream and
deepen equivalents); the pack was the one paid route with no router test at all.
"""
from __future__ import annotations

import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.connections import get_token_connections_repository
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.services import paid_run, xp_service
from app.services.llm_provider import get_llm_provider


def _client() -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="n@example.com")
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


class _FakeJobsRepo:
    def __init__(self, jobs: dict[str, dict] | None = None) -> None:
        self.deepenings: dict[str, str] = {}
        self.jobs = jobs if jobs is not None else {
            "j1": {
                "job_title": "Manager, Presales",
                "company_name": "Netscribes",
                "job_description": "Engage with clients. Reporting to : VP",
            }
        }

    def get_deepening(self, _user_id: str, _job_id: str, key: str):
        return self.deepenings.get(key)

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict]:
        return [self.jobs[j] for j in job_ids if j in self.jobs]

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
    # The boundary blanks a 5xx to "Something went wrong"; this one is authored
    # and must reach the person, who otherwise cannot tell they kept their coins.
    assert resp.json()["detail"] == (
        "Couldn't build the outreach plan right now. Try again shortly — you were not charged."
    )
    # Non-vacuous: the route really did reach the model and come back empty-handed,
    # rather than 503-ing somewhere earlier for an unrelated reason.
    assert provider.calls == 1
    # The whole point: no deliverable, no LLM value delivered, no coins taken.
    assert charged == []
    assert repo.deepenings == {}


def test_reach_pack_post_replays_cached_purchase_without_charging(monkeypatch):
    """A Retry after the client gave up on a run that then finished pays nothing:
    the second POST finds the pack the first one cached and replays it."""
    pack = {
        "outreach_message": "Hi — I run presales for a data analytics team.",
        "referral_ask": "Would you refer me?",
        "timing": "Tuesday morning",
        "warm_intro": "",
    }
    repo = _FakeJobsRepo()
    repo.deepenings["reach_pack"] = json.dumps(pack)
    charged: list = []

    async def _charge(*a, **kw):
        charged.append(a)
        return 0

    async def _balance(*_a, **_kw):
        return 3000

    monkeypatch.setattr(xp_service, "get_xp_balance", _balance)
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)

    provider = _DeadProvider()
    client = _client()
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: _FakeCVRepo()
    app.dependency_overrides[get_token_connections_repository] = lambda: _FakeConnectionsRepo()
    app.dependency_overrides[get_llm_provider] = lambda: provider

    resp = client.post("/jobs/j1/reach/pack")

    assert resp.status_code == 200
    assert resp.json()["pack"] == pack
    assert resp.json()["new_coin_balance"] == 3000
    assert provider.calls == 0
    assert charged == []


# ── one run per (user, job) at a time (paid_run) ──────────────────────────────

_PACK_REPLY = json.dumps({
    "outreach_message": "Hi — I run presales for a data analytics team.",
    "referral_ask": "Would you refer me?",
    "timing": "Tuesday morning",
    "warm_intro": "",
})


class _HeldProvider:
    """A model call that stays in flight until the test lets it finish, or
    answers on its own after `slow` seconds."""

    def __init__(self, slow: float | None = None) -> None:
        self.calls = 0
        self.slow = slow
        self.entered = asyncio.Event()
        self.finish = asyncio.Event()

    async def complete(self, _messages, max_tokens=900, temperature=None):
        self.calls += 1
        self.entered.set()
        if self.slow is None:
            await self.finish.wait()
        else:
            await asyncio.sleep(self.slow)
        return _PACK_REPLY


def _held_pack_client(
    monkeypatch, repo: _FakeJobsRepo, charged: list, provider: _HeldProvider,
) -> None:
    from app.config import settings

    async def _charge(*a, **kw):
        charged.append(a)
        return 2950

    async def _assert_can_spend(*_a, **_kw):
        return None

    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(xp_service, "assert_can_spend_xp", _assert_can_spend)
    monkeypatch.setattr(xp_service, "charge_or_raise", _charge)
    _client()
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    app.dependency_overrides[get_token_cv_repository] = lambda: _FakeCVRepo()
    app.dependency_overrides[get_token_connections_repository] = lambda: _FakeConnectionsRepo()
    app.dependency_overrides[get_llm_provider] = lambda: provider


def test_a_second_pack_post_while_the_first_works_never_runs_or_charges(monkeypatch):
    """A Retry after the client gave up, a double click, a second tab: the first
    run holds the claim, the second is told it is still working and never
    reaches the model or the wallet, and the GET says a run is building."""
    repo, charged, provider = _FakeJobsRepo(), [], _HeldProvider()
    _held_pack_client(monkeypatch, repo, charged, provider)

    async def _scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
            first = asyncio.create_task(client.post("/jobs/j1/reach/pack"))
            await asyncio.wait_for(provider.entered.wait(), 5)

            # Bounded: without the claim the second run would sit in the held
            # model call beside the first instead of being refused.
            second = await asyncio.wait_for(client.post("/jobs/j1/reach/pack"), 5)
            calls_during, charged_during = provider.calls, list(charged)
            during = (await client.get("/jobs/j1/reach/pack")).json()

            provider.finish.set()
            done = await asyncio.wait_for(first, 5)
            after = (await client.get("/jobs/j1/reach/pack")).json()
            return second, calls_during, charged_during, during, done, after

    second, calls_during, charged_during, during, done, after = asyncio.run(_scenario())
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["code"] == paid_run.IN_FLIGHT_CODE
    assert calls_during == 1 and charged_during == []
    assert during["purchased"] is False and during["building"] is True
    assert done.status_code == 200, done.text
    assert after["purchased"] is True and after["building"] is False
    assert provider.calls == 1
    assert len(charged) == 1, charged


def test_a_pack_that_outruns_its_bound_charges_nothing_and_frees_the_claim(monkeypatch):
    """The model work is bounded below the claim's lifetime, so a slow provider
    ladder cannot finish after its claim expired and race a successor."""
    monkeypatch.setattr(paid_run, "RUN_SECONDS", 0.05)
    repo, charged = _FakeJobsRepo(), []
    # Answers well after the bound: unbounded, it would be delivered and charged.
    _held_pack_client(monkeypatch, repo, charged, _HeldProvider(slow=1.0))
    client = TestClient(app)

    resp = client.post("/jobs/j1/reach/pack")

    assert resp.status_code == 503
    assert resp.json()["detail"].endswith("you were not charged.")
    assert charged == []
    assert client.get("/jobs/j1/reach/pack").json()["building"] is False


def _search_client(repo: _FakeJobsRepo) -> TestClient:
    client = _client()
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    return client


def test_reach_search_reads_the_job_by_id():
    """The caller names the job; Myro reads title/company/JD from its own row."""
    repo = _FakeJobsRepo({
        "ext_abc": {
            "job_title": "Netscribes - Manager - Presales - Data Analytics",
            "company_name": "Netscribes",
            "job_description": "Role : Presales\nReporting to : VP\nEngage with clients.",
        }
    })
    resp = _search_client(repo).get("/jobs/ext_abc/reach/search")
    assert resp.status_code == 200
    body = resp.json()
    assert body["reporting_target"] == "VP"
    assert body["primary"]["kind"] == "linkedin"
    assert "linkedin.com/search/results/people" in body["primary"]["url"]
    assert "Netscribes" in body["primary"]["label"]
    assert body["target_titles"]


def test_reach_search_unknown_job_is_404_not_an_empty_search():
    """The defect this shape removes: a caller with no job details used to get a
    200 with primary=None, rendered as "add a company or role on the page"."""
    resp = _search_client(_FakeJobsRepo({})).get("/jobs/missing/reach/search")
    assert resp.status_code == 404


def test_reach_search_requires_auth():
    app.dependency_overrides.clear()
    client = TestClient(app)
    resp = client.get("/jobs/j1/reach/search")
    assert resp.status_code in (401, 403)


def test_reach_search_has_no_body_driven_twin():
    """One input shape. The stateless POST that trusted caller-sent fields is gone."""
    resp = _search_client(_FakeJobsRepo()).post(
        "/jobs/reach/search", json={"job_title": "x", "company": "y"}
    )
    assert resp.status_code in (404, 405)
