"""Contract tests for GET /jobs/feed — the authed, company-agnostic /market browse feed.

Two surfaces are exercised:

* Repository (`JobsRepository.feed_jobs` / `user_skill_keys`) against an in-memory
  fake DB that faithfully applies eq filters, OR-ilike free-text, multi-key
  ordering, range/limit pagination and exact counts. This is where sort order,
  pagination math, filters, the personal cap, matched_skill_count and the
  caching round-trip guarantees are asserted.
* Endpoint (`TestClient`) for auth gating and response-shape wiring.

Caching is module-level global state in `app.repositories.jobs`; the autouse
`_clear_feed_caches` fixture wipes it between tests so cases never leak warm
rows into one another.
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.repositories.jobs as jobs_module
from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import JobsRepository, get_token_jobs_repository


# ── in-memory fake Supabase client ──────────────────────────────────────────


class _Result:
    def __init__(self, data: list[dict[str, Any]], count: int | None = None) -> None:
        self.data = data
        self.count = count


def _ilike_needle(or_expr: str) -> str:
    """Pull the %term% needle out of a PostgREST or() ilike expression."""
    match = re.search(r"%(.*?)%", or_expr)
    return (match.group(1) if match else "").lower()


class _Query:
    def __init__(self, db: "_FakeDB", table: str) -> None:
        self._db = db
        self._table = table
        self._count_exact = False
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._in: dict[str, list[Any]] = {}
        self._or_needle: str | None = None
        self._orders: list[tuple[str, bool]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, *_cols: Any, count: str | None = None) -> "_Query":
        if count == "exact":
            self._count_exact = True
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
        self._or_needle = _ilike_needle(expr)
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
        if self._or_needle:
            rows = [
                r
                for r in rows
                if self._or_needle in str(r.get("job_title") or "").lower()
                or self._or_needle in str(r.get("company_name") or "").lower()
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
    skills: list[str] | None = None,
    is_active: bool = True,
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
        "industry": "Technology",
        "industry_group": "Technology",
        "apply_url": f"https://jobs.example.com/{job_id}",
        "first_seen": first_seen,
        "is_active": is_active,
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
def _clear_feed_caches():
    jobs_module._feed_page_cache.clear()
    jobs_module._feed_personal_cache.clear()
    jobs_module._user_skill_keys_cache.clear()
    yield
    jobs_module._feed_page_cache.clear()
    jobs_module._feed_personal_cache.clear()
    jobs_module._user_skill_keys_cache.clear()


# ── sort modes ───────────────────────────────────────────────────────────────


def test_fresh_sort_returns_newest_first() -> None:
    repo, _ = _repo([
        _job("a", first_seen=20260101),
        _job("b", first_seen=20260603),
        _job("c", first_seen=20260315),
    ])
    result = repo.feed_jobs(sort="fresh", page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["b", "c", "a"]
    assert result["sort"] == "fresh"


def test_fresh_sort_breaks_ties_by_job_id_desc() -> None:
    repo, _ = _repo([
        _job("a", first_seen=20260601),
        _job("c", first_seen=20260601),
        _job("b", first_seen=20260601),
    ])
    result = repo.feed_jobs(sort="fresh", page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["c", "b", "a"]


def test_company_sort_groups_by_company_then_fresh() -> None:
    repo, _ = _repo([
        _job("a", company="Zeta", first_seen=20260101),
        _job("b", company="Acme", first_seen=20260101),
        _job("c", company="Acme", first_seen=20260601),
    ])
    result = repo.feed_jobs(sort="company", page_size=10)
    # Acme block first (asc), newest within block first; then Zeta.
    assert [r["job_id"] for r in result["rows"]] == ["c", "b", "a"]
    assert [r["company_name"] for r in result["rows"]] == ["Acme", "Acme", "Zeta"]


def test_personal_sort_ranks_by_matched_skill_count_desc() -> None:
    repo, _ = _repo(
        [
            _job("none", skills=["Go", "Rust"], first_seen=20260101),
            _job("one", skills=["Python", "Go"], first_seen=20260101),
            _job("two", skills=["Python", "SQL"], first_seen=20260101),
        ],
        [_user_skill("python", "Python"), _user_skill("sql", "SQL")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="personal", user_skill_keys=skills, page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["two", "one", "none"]
    assert [r["matched_skill_count"] for r in result["rows"]] == [2, 1, 0]


def test_personal_sort_uses_freshest_as_tiebreak_on_equal_overlap() -> None:
    repo, _ = _repo(
        [
            _job("old", skills=["Python"], first_seen=20260101),
            _job("new", skills=["Python"], first_seen=20260601),
        ],
        [_user_skill("python", "Python")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="personal", user_skill_keys=skills, page_size=10)
    # Equal overlap (1 each) → newest first.
    assert [r["job_id"] for r in result["rows"]] == ["new", "old"]


def test_unknown_sort_falls_back_to_fresh() -> None:
    repo, _ = _repo([_job("a", first_seen=20260101), _job("b", first_seen=20260601)])
    result = repo.feed_jobs(sort="bogus", page_size=10)
    assert result["sort"] == "fresh"
    assert [r["job_id"] for r in result["rows"]] == ["b", "a"]


# ── fit composite (Best fit) — data-aware weight degrade (market rework Q7) ────


def test_fit_sort_both_signals_blends_skill_role_fresh() -> None:
    # CV + roles → weights .5 skill / .3 role / .2 fresh. The job that wins on
    # the two heavy signals (skill+role) outranks a fresher job with neither.
    repo, _ = _repo(
        [
            _job("fresh_only", title="Designer", skills=["Go"], first_seen=20260601),
            _job("strong", title="Data Analyst", skills=["Python", "SQL"], first_seen=20260101),
        ],
        [_user_skill("python", "Python"), _user_skill("sql", "SQL")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(
        sort="fit", user_skill_keys=skills, user_target_roles=["Data Analyst"], page_size=10
    )
    assert result["sort"] == "fit"
    assert [r["job_id"] for r in result["rows"]] == ["strong", "fresh_only"]


def test_fit_sort_cv_only_ranks_by_skill_then_fresh() -> None:
    # No target roles → role weight is dead, skill (.7) dominates over fresh (.3).
    repo, _ = _repo(
        [
            _job("newer_weak", skills=["Go"], first_seen=20260601),
            _job("older_strong", skills=["Python", "SQL"], first_seen=20260101),
        ],
        [_user_skill("python", "Python"), _user_skill("sql", "SQL")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="fit", user_skill_keys=skills, page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["older_strong", "newer_weak"]


def test_fit_sort_roles_only_ranks_by_role_then_fresh() -> None:
    # No CV → skill weight dead, role (.6) dominates over fresh (.4).
    repo, _ = _repo([
        _job("newer_norole", title="Designer", first_seen=20260601),
        _job("older_role", title="Data Analyst", first_seen=20260101),
    ])
    result = repo.feed_jobs(
        sort="fit", user_target_roles=["Data Analyst"], page_size=10
    )
    assert [r["job_id"] for r in result["rows"]] == ["older_role", "newer_norole"]


def test_fit_sort_no_signals_degrades_to_pure_freshness() -> None:
    # Neither CV nor roles → weights collapse to 1.0 fresh → identical to 'fresh'.
    repo, _ = _repo([
        _job("a", first_seen=20260101),
        _job("b", first_seen=20260603),
        _job("c", first_seen=20260315),
    ])
    result = repo.feed_jobs(sort="fit", page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["b", "c", "a"]


# ── new fit lenses + narrowing filters ───────────────────────────────────────


def test_role_sort_ranks_by_target_role_match() -> None:
    repo, _ = _repo([
        _job("eng", title="Software Engineer", first_seen=20260101),
        _job("da", title="Senior Data Analyst", first_seen=20260101),
        _job("pm", title="Product Manager", first_seen=20260101),
    ])
    result = repo.feed_jobs(
        sort="role",
        user_target_roles=["Data Analyst", "Product Manager"],
        page_size=10,
    )
    ids = [r["job_id"] for r in result["rows"]]
    # eng covers no target role → ranked last; the two matches lead.
    assert ids[-1] == "eng"
    assert set(ids[:2]) == {"da", "pm"}
    assert {r["job_id"]: r["target_role_match"] for r in result["rows"]} == {
        "da": 1, "pm": 1, "eng": 0,
    }


def test_role_match_is_seniority_agnostic() -> None:
    repo, _ = _repo([_job("da", title="Senior Data Analyst", first_seen=20260101)])
    # 'Data Analyst' target matches a 'Senior Data Analyst' posting.
    result = repo.feed_jobs(sort="role", user_target_roles=["Data Analyst"], page_size=10)
    assert result["rows"][0]["target_role_match"] == 1


def test_target_role_only_filter_drops_non_matching() -> None:
    repo, _ = _repo([
        _job("da", title="Data Analyst", first_seen=20260101),
        _job("eng", title="Software Engineer", first_seen=20260101),
    ])
    result = repo.feed_jobs(
        target_role_only=True, user_target_roles=["Data Analyst"], page_size=10
    )
    assert [r["job_id"] for r in result["rows"]] == ["da"]


def test_min_skill_matches_filters_below_threshold() -> None:
    repo, _ = _repo(
        [
            _job("two", skills=["Python", "SQL"], first_seen=20260101),
            _job("one", skills=["Python", "Go"], first_seen=20260101),
            _job("none", skills=["Rust"], first_seen=20260101),
        ],
        [_user_skill("python", "Python"), _user_skill("sql", "SQL")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(min_skill_matches=2, user_skill_keys=skills, page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["two"]


def test_exclude_job_ids_drains_saved_and_skipped() -> None:
    repo, _ = _repo([
        _job("a", first_seen=20260601),
        _job("b", first_seen=20260501),
        _job("c", first_seen=20260401),
    ])
    result = repo.feed_jobs(sort="fresh", exclude_job_ids={"b"}, page_size=10)
    # Draining queue: 'b' (saved/skipped) gone; count reflects what's left.
    assert [r["job_id"] for r in result["rows"]] == ["a", "c"]
    assert result["available_total"] == 2


def test_freshness_days_drops_stale_jobs() -> None:
    from datetime import date, timedelta

    recent = int((date.today() - timedelta(days=2)).strftime("%Y%m%d"))
    stale = int((date.today() - timedelta(days=90)).strftime("%Y%m%d"))
    repo, _ = _repo([_job("recent", first_seen=recent), _job("stale", first_seen=stale)])
    result = repo.feed_jobs(sort="fresh", freshness_days=7, page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["recent"]


def test_following_only_scopes_to_followed_companies() -> None:
    repo, _ = _repo([
        _job("acme", company="Acme", first_seen=20260601),
        _job("zeta", company="Zeta", first_seen=20260601),
    ])
    result = repo.feed_jobs(
        sort="fresh", following_only=True, followed_companies={"Acme"}, page_size=10
    )
    assert [r["job_id"] for r in result["rows"]] == ["acme"]


def test_following_only_with_no_follows_returns_empty() -> None:
    repo, _ = _repo([_job("acme", company="Acme")])
    result = repo.feed_jobs(following_only=True, followed_companies=set(), page_size=10)
    assert result["rows"] == []
    assert result["available_total"] == 0


# ── pagination ───────────────────────────────────────────────────────────────


def test_pagination_no_dupes_or_gaps_across_pages() -> None:
    jobs = [_job(f"j{i:02d}", first_seen=20260000 + i) for i in range(10)]
    repo, _ = _repo(jobs)
    p1 = repo.feed_jobs(sort="fresh", page=1, page_size=4)
    p2 = repo.feed_jobs(sort="fresh", page=2, page_size=4)
    p3 = repo.feed_jobs(sort="fresh", page=3, page_size=4)

    ids1 = [r["job_id"] for r in p1["rows"]]
    ids2 = [r["job_id"] for r in p2["rows"]]
    ids3 = [r["job_id"] for r in p3["rows"]]
    assert len(ids1) == 4 and len(ids2) == 4 and len(ids3) == 2
    assert set(ids1) & set(ids2) == set()
    assert set(ids2) & set(ids3) == set()
    # Concatenation reconstructs the full ordered set with no gaps.
    assert ids1 + ids2 + ids3 == [f"j{i:02d}" for i in range(9, -1, -1)]


def test_has_next_page_and_available_total_stable_across_pages() -> None:
    jobs = [_job(f"j{i:02d}", first_seen=20260000 + i) for i in range(10)]
    repo, _ = _repo(jobs)
    p1 = repo.feed_jobs(sort="fresh", page=1, page_size=4)
    p3 = repo.feed_jobs(sort="fresh", page=3, page_size=4)

    assert p1["available_total"] == 10
    assert p3["available_total"] == 10  # stable across pages
    assert p1["has_next_page"] is True
    assert p3["has_next_page"] is False
    assert p1["returned_total"] == 4
    assert p3["returned_total"] == 2


def test_page_beyond_end_returns_empty_not_error() -> None:
    repo, _ = _repo([_job("a"), _job("b")])
    result = repo.feed_jobs(sort="fresh", page=99, page_size=10)
    assert result["rows"] == []
    assert result["returned_total"] == 0
    assert result["available_total"] == 2
    assert result["has_next_page"] is False


# ── filters ──────────────────────────────────────────────────────────────────


def test_role_domain_filter_narrows_results() -> None:
    repo, _ = _repo([
        _job("eng", role_domain="engineering"),
        _job("sales", role_domain="sales"),
    ])
    result = repo.feed_jobs(role_domain="engineering", page_size=10)
    assert [r["job_id"] for r in result["rows"]] == ["eng"]


def test_q_free_text_filter_matches_title_or_company() -> None:
    repo, _ = _repo([
        _job("a", title="Data Engineer", company="Acme"),
        _job("b", title="Sales Lead", company="Globex"),
        _job("c", title="Recruiter", company="Engineering Co"),
    ])
    result = repo.feed_jobs(q="engineer", page_size=10)
    # Matches title "Data Engineer" and company "Engineering Co".
    assert {r["job_id"] for r in result["rows"]} == {"a", "c"}


def test_location_filters_each_narrow_results() -> None:
    repo, _ = _repo([
        _job("blr", city="Bengaluru", country="India", mode="onsite"),
        _job("del", city="Delhi", country="India", mode="remote"),
        _job("nyc", city="New York", country="USA", mode="onsite"),
    ])
    assert {r["job_id"] for r in repo.feed_jobs(location_city="Bengaluru", page_size=10)["rows"]} == {"blr"}
    assert {r["job_id"] for r in repo.feed_jobs(location_country="India", page_size=10)["rows"]} == {"blr", "del"}
    assert {r["job_id"] for r in repo.feed_jobs(location_mode="onsite", page_size=10)["rows"]} == {"blr", "nyc"}


def test_combined_filters_AND_together() -> None:
    repo, _ = _repo([
        _job("hit", role_domain="engineering", country="India", mode="remote"),
        _job("wrong_mode", role_domain="engineering", country="India", mode="onsite"),
        _job("wrong_country", role_domain="engineering", country="USA", mode="remote"),
        _job("wrong_domain", role_domain="sales", country="India", mode="remote"),
    ])
    result = repo.feed_jobs(
        role_domain="engineering", location_country="India", location_mode="remote", page_size=10
    )
    assert [r["job_id"] for r in result["rows"]] == ["hit"]


def test_no_match_filter_returns_empty_cleanly() -> None:
    repo, _ = _repo([_job("a", country="India")])
    result = repo.feed_jobs(location_country="Atlantis", page_size=10)
    assert result["rows"] == []
    assert result["available_total"] == 0
    assert result["has_next_page"] is False
    assert result["sort"] == "fresh"


# ── personal cap ──────────────────────────────────────────────────────────────


def test_personal_available_total_reflects_cap_not_full_pool(monkeypatch: Any) -> None:
    # Cap the in-Python overlap set at 3; available_total documents the CAP, not
    # the 6-row DB pool — personal rank is over the freshest N candidates only.
    monkeypatch.setattr(JobsRepository, "_FEED_PERSONAL_CAP", 3)
    jobs = [_job(f"j{i}", skills=["Python"], first_seen=20260000 + i) for i in range(6)]
    repo, _ = _repo(jobs, [_user_skill("python", "Python")])
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="personal", user_skill_keys=skills, page=1, page_size=10)
    assert result["available_total"] == 3
    assert result["returned_total"] == 3
    # The 3 surfaced are the freshest of the pool (j5, j4, j3).
    assert [r["job_id"] for r in result["rows"]] == ["j5", "j4", "j3"]


# ── matched_skill_count ────────────────────────────────────────────────────────


def test_matched_skill_count_against_requesting_user_cv() -> None:
    repo, _ = _repo(
        [_job("j", skills=["Python", "SQL", "Go"])],
        [_user_skill("python", "Python"), _user_skill("sql", "SQL")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="fresh", user_skill_keys=skills, page_size=10)
    assert result["rows"][0]["matched_skill_count"] == 2


def test_matched_skill_count_zero_when_no_overlap() -> None:
    repo, _ = _repo(
        [_job("j", skills=["Go", "Rust"])],
        [_user_skill("python", "Python")],
    )
    skills = repo.user_skill_keys("u1")
    result = repo.feed_jobs(sort="fresh", user_skill_keys=skills, page_size=10)
    assert result["rows"][0]["matched_skill_count"] == 0


def test_matched_skill_count_zero_when_no_user_skills() -> None:
    repo, _ = _repo([_job("j", skills=["Python"])])
    result = repo.feed_jobs(sort="fresh", user_skill_keys=None, page_size=10)
    assert result["rows"][0]["matched_skill_count"] == 0


# ── caching: warm hit avoids the DB round-trip ──────────────────────────────────


def test_warm_cache_avoids_db_roundtrip_for_db_paged_sort() -> None:
    repo, db = _repo([_job("a"), _job("b")])
    repo.feed_jobs(sort="fresh", page=1, page_size=10)
    repo.feed_jobs(sort="fresh", page=1, page_size=10)
    assert db.call_count("jobs") == 1


def test_warm_cache_avoids_db_roundtrip_for_personal_sort() -> None:
    repo, db = _repo([_job("a", skills=["Python"])], [_user_skill("python", "Python")])
    skills = repo.user_skill_keys("u1")
    repo.feed_jobs(sort="personal", user_skill_keys=skills, page=1, page_size=10)
    repo.feed_jobs(sort="personal", user_skill_keys=skills, page=1, page_size=10)
    assert db.call_count("jobs") == 1


def test_user_skill_keys_cached_per_user() -> None:
    repo, db = _repo([], [_user_skill("python", "Python")])
    first = repo.user_skill_keys("u1")
    second = repo.user_skill_keys("u1")
    assert first == second == {"python"}
    assert db.call_count("user_skills") == 1


def test_cache_key_separates_sort_modes() -> None:
    repo, db = _repo([_job("a"), _job("b")])
    repo.feed_jobs(sort="fresh", page=1, page_size=10)
    repo.feed_jobs(sort="company", page=1, page_size=10)
    assert db.call_count("jobs") == 2  # different sort → different key → fresh query


def test_cache_key_separates_pages() -> None:
    jobs = [_job(f"j{i:02d}", first_seen=20260000 + i) for i in range(10)]
    repo, db = _repo(jobs)
    repo.feed_jobs(sort="fresh", page=1, page_size=4)
    repo.feed_jobs(sort="fresh", page=2, page_size=4)
    assert db.call_count("jobs") == 2


def test_cache_key_separates_filters() -> None:
    repo, db = _repo([_job("in", country="India"), _job("us", country="USA")])
    repo.feed_jobs(sort="fresh", location_country="India", page_size=10)
    repo.feed_jobs(sort="fresh", location_country="USA", page_size=10)
    assert db.call_count("jobs") == 2


def test_warm_cache_recomputes_matched_count_per_user() -> None:
    # Two different users share the same filter/sort cache slot but must each get
    # their own matched_skill_count — caching raw rows, shaping per-request.
    jobs = [_job("j", skills=["Python", "SQL"])]
    db = _FakeDB(
        jobs,
        [
            _user_skill("python", "Python", user_id="u1"),
            _user_skill("sql", "SQL", user_id="u2"),
            _user_skill("go", "Go", user_id="u2"),
        ],
    )
    repo = JobsRepository(db=db, admin_db=db)
    r1 = repo.feed_jobs(sort="fresh", user_skill_keys=repo.user_skill_keys("u1"), page_size=10)
    r2 = repo.feed_jobs(sort="fresh", user_skill_keys=repo.user_skill_keys("u2"), page_size=10)
    assert db.call_count("jobs") == 1  # shared raw-row cache
    assert r1["rows"][0]["matched_skill_count"] == 1  # python
    assert r2["rows"][0]["matched_skill_count"] == 1  # sql (go absent from job)


# ── endpoint: auth + wiring ─────────────────────────────────────────────────────


def test_feed_requires_authentication() -> None:
    # No Authorization header → HTTPBearer rejects before the principal resolves.
    with TestClient(app) as client:
        response = client.get("/jobs/feed")
    assert response.status_code in (401, 403)


def test_feed_endpoint_returns_feed_payload() -> None:
    class _FeedRepo:
        def resolve_role_domain_for_clusters(self, _clusters: list[str]) -> str | None:
            return "engineering"

        def user_skill_keys(self, _user_id: str) -> set[str]:
            return {"python"}

        def user_target_locations(self, _user_id: str) -> list[str]:
            return []

        def get_user_target_roles(self, _user_id: str) -> list[str]:
            return ["Data Engineer"]

        def get_dismissed_job_card_ids(self, _user_id: str) -> list[str]:
            return []

        def get_saved_job_ids(self, _user_id: str) -> list[str]:
            return []

        def get_followed_company_names(self, _user_id: str) -> set[str]:
            return set()

        def feed_jobs(self, **_kwargs: Any) -> dict[str, Any]:
            return {
                "rows": [
                    {
                        "job_id": "j1",
                        "job_title": "Data Engineer",
                        "company_name": "Acme",
                        "job_description": "JD",
                        "matched_skill_count": 1,
                        "skills": ["Python"],
                    }
                ],
                "available_total": 1,
                "returned_total": 1,
                "page": 1,
                "page_size": 20,
                "has_next_page": False,
                "sort": "fresh",
            }

    repo = _FeedRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/jobs/feed?sort=fresh")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["sort"] == "fresh"
    assert body["available_total"] == 1
    assert body["jobs"][0]["job_id"] == "j1"
    assert body["jobs"][0]["matched_skill_count"] == 1
