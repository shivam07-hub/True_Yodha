"""Contract tests for GET /jobs/feed — the authed /market list.

It is a FINITE list now, not a browse feed: `candidates_for_user` filters the whole
corpus per user and ranks what survives, and `shortlist_jobs` fetches card columns
for the forty it named. What this file used to assert — sort modes, pagination
math, server filters, the 500-row personal cap, two shared caches — went with the
sample. Level, direction, location, the employer cap and the draining queue are
decided in SQL and belong to the migration's own contract test.

What is left to guard here is the seam between the two reads:

* Repository — the RPC's ORDER is the ranking and must survive the `in_` fetch
  that has no order at all; a named job missing from the table is dropped, not a
  KeyError; the reasons ride onto the card; a failure returns an empty list rather
  than a 500 on the one read a user waits on.
* Endpoint (`TestClient`) — auth gating, the finite response shape, brain badges.

The fake DB is kept verbatim from the browse-feed suite: it faithfully applies eq
filters, `in_`, OR-ilike free text and multi-key ordering, which is more than the
new path needs but is exactly what makes "the order came from the RPC, not from
the table read" a real assertion.
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.repositories.jobs as jobs_module
from postgrest.exceptions import APIError
from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import JobsRepository, get_token_jobs_repository


# ── in-memory fake Supabase client ──────────────────────────────────────────


class _Result:
    def __init__(self, data: list[dict[str, Any]], count: int | None = None) -> None:
        self.data = data
        self.count = count


def _ilike_needles(or_expr: str) -> list[str]:
    """Pull every %term% needle out of a PostgREST or() ilike expression."""
    return [match.lower() for match in re.findall(r"%(.*?)%", or_expr)]


class _Query:
    def __init__(self, db: "_FakeDB", table: str) -> None:
        self._db = db
        self._table = table
        self._count_exact = False
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._in: dict[str, list[Any]] = {}
        self._or_needles: list[str] = []
        self._orders: list[tuple[str, bool]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, *_cols: Any, count: str | None = None) -> "_Query":
        if count == "exact":
            self._count_exact = True
        return self

    def insert(self, payload: Any) -> "_Query":
        self._db.inserted[self._table] = payload
        return self

    def eq(self, col: str, val: Any) -> "_Query":
        self._eq[col] = val
        return self

    def gte(self, col: str, val: Any) -> "_Query":
        self._gte[col] = val
        return self

    def in_(self, col: str, vals: list[Any]) -> "_Query":
        self._in[col] = list(vals)
        return self

    def or_(self, expr: str) -> "_Query":
        self._or_needles = _ilike_needles(expr)
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._orders.append((col, desc))
        return self

    def range(self, start: int, end: int) -> "_Query":
        self._range = (start, end)
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def execute(self) -> _Result:
        self._db.calls.append(self._table)
        rows = [dict(r) for r in self._db.tables.get(self._table, [])]
        for col, val in self._eq.items():
            rows = [r for r in rows if r.get(col) == val]
        for col, val in self._gte.items():
            rows = [r for r in rows if r.get(col) is not None and r.get(col) >= val]
        for col, vals in self._in.items():
            rows = [r for r in rows if r.get(col) in vals]
        if self._or_needles:
            rows = [
                r
                for r in rows
                if any(
                    needle in str(r.get("job_title") or "").lower()
                    or needle in str(r.get("company_name") or "").lower()
                    or needle in str(r.get("job_description") or "").lower()
                    for needle in self._or_needles
                )
            ]
        if self._table != "jobs":
            return _Result(rows)
        # Multi-key ordering: PostgREST applies .order() calls left→right (first =
        # primary), so a stable sort run least-significant-first reproduces it.
        for col, desc in reversed(self._orders):
            rows.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        total = len(rows)
        if self._limit is not None:
            rows = rows[: self._limit]
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        return _Result(rows, count=(total if self._count_exact else None))


class _FakeDB:
    def __init__(self, jobs: list[dict[str, Any]], user_skills: list[dict[str, Any]]) -> None:
        self.tables = {"jobs": jobs, "user_skills": user_skills}
        self.calls: list[str] = []
        self.inserted: dict[str, Any] = {}

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def call_count(self, table: str) -> int:
        return sum(1 for t in self.calls if t == table)


def _job(
    job_id: str,
    *,
    title: str = "Engineer",
    company: str = "Acme",
    first_seen: int = 20260601,
    country: str | None = "India",
    city: str | None = "Bengaluru",
    mode: str = "onsite",
    role_domain: str = "engineering",
    role_family: str | None = None,
    skills: list[str] | None = None,
    seniority_level: str | None = None,
    min_years_experience: int | None = None,
    is_active: bool = True,
    listing_confidence: str = "active",
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "job_title": title,
        "company_name": company,
        "job_description": f"JD for {job_id}",
        "location": None,
        "location_raw": city,
        "location_city": city,
        "location_country": country,
        "location_mode": mode,
        "location_quality": "ok",
        "role_domain": role_domain,
        "role_family": role_family,
        "seniority_level": seniority_level,
        "min_years_experience": min_years_experience,
        "industry": "Technology",
        "industry_group": "Technology",
        "apply_url": f"https://jobs.example.com/{job_id}",
        "first_seen": first_seen,
        "is_active": is_active,
        "listing_confidence": listing_confidence,
        "main_skills": skills if skills is not None else ["Python", "SQL"],
    }


def _user_skill(taxonomy_key: str, display_name: str, user_id: str = "u1") -> dict[str, Any]:
    return {
        "user_id": user_id,
        "matched_level": 3,
        "proficiency_title": "Proficient",
        "skills": {"taxonomy_key": taxonomy_key, "display_name": display_name},
    }


def _repo(jobs: list[dict[str, Any]], user_skills: list[dict[str, Any]] | None = None) -> tuple[JobsRepository, _FakeDB]:
    db = _FakeDB(jobs, user_skills or [])
    return JobsRepository(db=db, admin_db=db), db


@pytest.fixture(autouse=True)
def _clear_skill_cache():
    jobs_module._user_skill_keys_cache.clear()
    yield
    jobs_module._user_skill_keys_cache.clear()


def _with_rpc(db: _FakeDB, picks: list[dict[str, Any]]) -> _FakeDB:
    """Teach the fake DB the one RPC the list depends on."""

    def _rpc(name: str, params: dict[str, Any]) -> Any:
        db.calls.append(f"rpc:{name}")
        assert name == "candidates_for_user"
        return _Result(picks[: params["p_limit"]])

    db.rpc = lambda name, params: type("_C", (), {"execute": lambda _s: _rpc(name, params)})()
    return db


def _pick(job_id: str, **over: Any) -> dict[str, Any]:
    return {
        "job_id": job_id, "score": 10.0, "overlap": 2,
        "on_direction": True, "level_stated": True, "checked_recently": False,
        **over,
    }


# ── the seam between the two reads ───────────────────────────────────────────


def test_the_rpcs_order_is_the_lists_order() -> None:
    """The whole point of the rewrite is that SQL decides the ranking. The `in_`
    fetch that follows has no ORDER BY, so whatever order PostgREST happens to
    return would silently replace it — here the table is deliberately stored in
    the opposite order."""
    repo, db = _repo([_job("j3"), _job("j2"), _job("j1")])
    _with_rpc(db, [_pick("j1"), _pick("j2"), _pick("j3")])

    rows = repo.shortlist_jobs("u1")

    assert [r["job_id"] for r in rows] == ["j1", "j2", "j3"]


def test_a_named_job_missing_from_the_table_is_dropped_not_raised() -> None:
    """Retrieval and the card read are two reads, so a listing can be retired
    between them. The list comes back one shorter; it does not 500."""
    repo, db = _repo([_job("j1")])
    _with_rpc(db, [_pick("j1"), _pick("vanished")])

    assert [r["job_id"] for r in repo.shortlist_jobs("u1")] == ["j1"]


def test_each_card_carries_why_it_was_chosen() -> None:
    """A list of forty that cannot say why is indistinguishable from forty that
    were not chosen."""
    repo, db = _repo([_job("j1")])
    _with_rpc(db, [_pick("j1", on_direction=True, level_stated=False, checked_recently=True)])

    card = repo.shortlist_jobs("u1")[0]

    assert card["on_direction"] is True
    assert card["level_stated"] is False
    assert card["checked_recently"] is True


def test_matched_skills_are_the_requesting_users_own() -> None:
    repo, db = _repo([_job("j1", skills=["Python", "Kafka"])])
    _with_rpc(db, [_pick("j1")])

    card = repo.shortlist_jobs("u1", skill_keys={"python"})[0]

    assert card["matched_skill_count"] == 1
    assert card["matched_skills"] == ["Python"]


def test_an_empty_shortlist_never_reads_the_cards_table() -> None:
    repo, db = _repo([_job("j1")])
    _with_rpc(db, [])

    assert repo.shortlist_jobs("u1") == []
    assert db.call_count("jobs") == 0


def test_a_zero_limit_reads_nothing_at_all() -> None:
    """`limit=0` is a caller asking for nothing, which is not the same as asking
    for the default. It must not spend the RPC to find that out."""
    repo, db = _repo([_job("j1")])
    _with_rpc(db, [_pick("j1")])

    assert repo.shortlist_jobs("u1", limit=0) == []
    assert db.calls == []


def test_a_failed_retrieval_returns_nothing_rather_than_raising() -> None:
    """This is the one read a user waits on. An empty list paints "no roles yet";
    an exception paints a 500 over the whole page."""
    repo, db = _repo([_job("j1")])

    class _Boom:
        def execute(self) -> Any:
            raise APIError({"message": "statement timeout"})

    db.rpc = lambda _name, _params: _Boom()

    assert repo.shortlist_jobs("u1") == []


def test_the_list_does_not_load_full_job_descriptions() -> None:
    """The JD averages several KB. Pulling it for forty cards nobody has opened is
    what saturated every other read during a browsing burst."""
    assert "job_description" not in JobsRepository._FEED_COLUMNS


# ── endpoint: auth + wiring ─────────────────────────────────────────────────────


class _ListRepo:
    """The endpoint's whole repository surface — which is now four methods."""

    SHORTLIST_SIZE = 40

    def __init__(self, rows: list[dict[str, Any]], evals: dict[str, Any] | None = None) -> None:
        self.rows = rows
        self.evals = evals or {}
        self.asked: dict[str, Any] = {}

    def get_feed_context(self) -> dict[str, Any]:
        return {"skill_keys": {"python"}, "target_roles": ["Data Engineer"]}

    def shortlist_jobs(self, user_id: str, **kw: Any) -> list[dict[str, Any]]:
        self.asked = {"user_id": user_id, **kw}
        return [dict(r) for r in self.rows]

    def get_cached_match_evals(self, _u: str, _ids: list[str], *, full: bool = False) -> dict[str, Any]:
        return self.evals

    def record_recommendation_exposures(self, _u: str, rows: list[dict], *, surface: str) -> int:
        return len(rows)


def _get_feed(repo: Any, url: str = "/jobs/feed") -> Any:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            return client.get(url)
    finally:
        app.dependency_overrides.clear()


def test_feed_requires_authentication() -> None:
    # No Authorization header → HTTPBearer rejects before the principal resolves.
    with TestClient(app) as client:
        response = client.get("/jobs/feed")
    assert response.status_code in (401, 403)


def test_the_endpoint_returns_a_finite_list_and_says_what_it_was_capped_at() -> None:
    repo = _ListRepo([{
        "job_id": "j1", "job_title": "Data Engineer", "company_name": "Acme",
        "job_description": None, "matched_skill_count": 1, "skills": ["Python"],
        "on_direction": True,
    }])

    response = _get_feed(repo)

    assert response.status_code == 200
    body = response.json()
    assert body["jobs"][0]["job_id"] == "j1"
    assert body["jobs"][0]["matched_skill_count"] == 1
    assert body["jobs"][0]["on_direction"] is True
    assert body["shortlist_size"] == 40
    # The pagination contract is gone, not merely unused: a client reading
    # `has_next_page` off this response would page for ever.
    for gone in ("page", "page_size", "has_next_page", "available_total", "sort", "expansion_tier"):
        assert gone not in body


def test_the_endpoint_passes_the_users_own_context_to_retrieval() -> None:
    repo = _ListRepo([])

    _get_feed(repo)

    assert repo.asked["user_id"] == "u1"
    assert repo.asked["skill_keys"] == {"python"}
    assert repo.asked["target_roles"] == ["Data Engineer"]


def test_the_endpoint_takes_no_filters() -> None:
    """Every narrowing the filters sheet offered is a view filter over forty cards
    the client already holds. A query param that still reached the server would be
    a filter the response cannot honour — and silence would be the answer."""
    from app.main import app as fastapi_app

    route = next(r for r in fastapi_app.routes if getattr(r, "path", "") == "/jobs/feed"
                 and "GET" in getattr(r, "methods", set()))
    params = {p for p in route.dependant.query_params}  # type: ignore[attr-defined]
    assert params == set(), f"the list still accepts {params}"


def test_feed_attaches_cached_brain_badges() -> None:
    """Consolidation D: a cached Matching-Brain eval decorates the card (grade /
    verdict / legitimacy) at read time, no LLM."""
    repo = _ListRepo(
        [
            {"job_id": "j1", "job_title": "DE", "company_name": "Acme", "job_description": None},
            {"job_id": "j2", "job_title": "SRE", "company_name": "Beta", "job_description": None},
        ],
        evals={
            "j1": {
                "overall_score": 4.2, "grade": "A", "recommendation": "Apply",
                "legitimacy_tier": "suspicious", "legitimacy_reason": "no scope",
                "archetype": "Data Engineer",
            }
        },
    )

    body = _get_feed(repo).json()

    j1, j2 = body["jobs"]
    assert j1["grade"] == "A"
    assert j1["recommendation"] == "Apply"
    assert j1["legitimacy_tier"] == "suspicious"
    assert j1["archetype"] == "Data Engineer"
    # A job with no cached eval carries no brain badge. It is unread, so the
    # verdict is the provisional `checking` — a missing one is how the list
    # presented retrieval order as a ranking.
    assert j2["grade"] is None
    assert j2["legitimacy_tier"] is None
    assert j2["verdict"] == "checking"
    assert j2["match_score"] is None
    assert body["ranked_count"] == 1


def test_hidden_feed_jobs_can_be_recovered() -> None:
    class _HiddenRepo:
        def get_dismissed_jobs(self, user_id: str) -> list[dict[str, Any]]:
            assert user_id == "u1"
            return [{
                "job_id": "hidden-1",
                "job_title": "Product Manager",
                "company_name": "Acme",
                "location": "Bengaluru",
                "dismissed_at": "2026-06-19T10:00:00Z",
            }]

    response = _get_feed(_HiddenRepo(), "/jobs/feed/hidden")

    assert response.status_code == 200
    assert response.json()[0]["job_id"] == "hidden-1"
