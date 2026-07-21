from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import Mock, patch

import app.repositories.job_skills_read_model as job_skills_module
from app.repositories.job_skills_read_model import (
    fetch_all_rows,
    fetch_job_skill_rows,
    fetch_job_skill_rows_via_rpc,
)
import app.repositories.jobs as jobs_module
from app.repositories.jobs import JobsRepository


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]], *, table: str, db: "_FakeDB") -> None:
        self._rows = rows
        self._table = table
        self._db = db
        self._eq_filters: list[tuple[str, Any]] = []
        self._in_filters: list[tuple[str, list[Any]]] = []
        self._gte_filters: list[tuple[str, Any]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None
        self._order: tuple[str, bool] | None = None

    def select(self, _columns: str) -> "_FakeQuery":
        return self

    def or_(self, _clause: str) -> "_FakeQuery":
        # Recall filter (title ilike-OR) — a no-op in the fake; the precision filter
        # (_role_match_score) and the eq/gte freshness gates do the real narrowing.
        return self

    def order(self, key: str, desc: bool = False) -> "_FakeQuery":
        self._order = (key, desc)
        return self

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        self._eq_filters.append((key, value))
        return self

    def in_(self, key: str, values: list[Any]) -> "_FakeQuery":
        self._in_filters.append((key, values))
        return self

    def gte(self, key: str, value: Any) -> "_FakeQuery":
        self._gte_filters.append((key, value))
        return self

    def limit(self, value: int) -> "_FakeQuery":
        self._limit = value
        return self

    def range(self, start: int, end: int) -> "_FakeQuery":
        self._range = (start, end)
        self._db.ranges.append((self._table, start, end))
        return self

    def execute(self) -> _Result:
        rows = self._rows
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]
        for key, values in self._in_filters:
            rows = [row for row in rows if row.get(key) in values]
        for key, value in self._gte_filters:
            rows = [row for row in rows if row.get(key) is not None and row.get(key) >= value]

        if self._order is not None:
            key, desc = self._order
            rows = sorted(rows, key=lambda r: r.get(key) or 0, reverse=desc)

        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        elif self._limit is not None:
            rows = rows[: self._limit]

        return _Result(rows)


class _FakeRpcCall:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def execute(self) -> _Result:
        return _Result(self._data)


class _FakeDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self.ranges: list[tuple[str, int, int]] = []

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []), table=name, db=self)

    def rpc(self, name: str, params: dict[str, Any]) -> _FakeRpcCall:
        # Model the count_job_demand_for_skills GROUP BY aggregate over the fake's
        # job_skills table — the primary path of get_user_skill_demand_snapshot.
        if name == "count_job_demand_for_skills":
            wanted = set(params["p_skill_ids"])
            job_count: dict[int, int] = {}
            weighted: dict[int, int] = {}
            for row in self._tables.get("job_skills", []):
                sid = row.get("skill_id")
                if sid not in wanted:
                    continue
                job_count[sid] = job_count.get(sid, 0) + 1
                weighted[sid] = weighted.get(sid, 0) + (2 if row.get("is_primary") else 1)
            return _FakeRpcCall(
                [
                    {"skill_id": sid, "job_count": job_count[sid], "weighted_demand": weighted[sid]}
                    for sid in job_count
                ]
            )
        raise NotImplementedError(name)


def test_fetch_all_rows_paginates_until_short_page() -> None:
    rows = [{"job_id": f"j{i}"} for i in range(2501)]
    db = _FakeDB({"jobs": rows})

    result = fetch_all_rows(
        db,
        table="jobs",
        columns="job_id",
        page_size=1000,
    )

    assert len(result) == 2501
    assert db.ranges == [
        ("jobs", 0, 999),
        ("jobs", 1000, 1999),
        ("jobs", 2000, 2999),
    ]


def test_fetch_job_skill_rows_respects_primary_filter_across_pages() -> None:
    rows = [
        {"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "a", "is_primary": False, "skills": {"taxonomy_key": "excel"}},
        {"job_id": "b", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
        {"job_id": "c", "is_primary": False, "skills": {"taxonomy_key": "jira"}},
        {"job_id": "d", "is_primary": True, "skills": {"taxonomy_key": "aws"}},
    ]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, only_primary=True, page_size=2)

    assert [r["job_id"] for r in result] == ["a", "b", "d"]
    assert db.ranges == [
        ("job_skills", 0, 1),
        ("job_skills", 2, 3),
    ]


def test_fetch_job_skill_rows_scoped_to_job_ids() -> None:
    rows = [
        {"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "b", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
        {"job_id": "c", "is_primary": False, "skills": {"taxonomy_key": "jira"}},
    ]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, job_ids=["a", "c"])

    assert {r["job_id"] for r in result} == {"a", "c"}
    assert len(result) == 2


def test_fetch_job_skill_rows_empty_job_ids_returns_empty() -> None:
    rows = [{"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}}]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, job_ids=[])

    assert result == []


def test_jobs_repository_fetch_analytics_rows_reads_all_pages() -> None:
    # fetch_analytics_rows no longer fetches job_skills (skills are lazy-loaded per entity).
    # It only needs to paginate across all jobs rows and hydrate location fields.
    jobs = [
        {"job_id": f"j{i}", "company_name": "Acme" if i % 2 == 0 else "Globex", "industry": "Tech", "batch_date": 20260504}
        for i in range(1500)
    ]
    db = _FakeDB({"jobs": jobs, "job_skills": []})

    rows = JobsRepository(db).fetch_analytics_rows()

    assert len(rows) == 1500
    by_id = {row["job_id"]: row for row in rows}
    assert by_id["j0"]["company_name"] == "Acme"
    assert by_id["j1"]["company_name"] == "Globex"
    assert ("jobs", 0, 999) in db.ranges
    assert ("jobs", 1000, 1999) in db.ranges


def _make_analytics_db() -> "_FakeDB":
    jobs = [{"job_id": "j0", "company_name": "Acme", "industry": "Tech", "batch_date": 20260504}]
    job_skills = [{"job_id": "j0", "is_primary": True, "skills": {"taxonomy_key": "python"}}]
    return _FakeDB({"jobs": jobs, "job_skills": job_skills})


def test_compile_market_analytics_enriches_company_with_dominant_country_and_industry() -> None:
    jobs_module._analytics_cache.clear()
    jobs = [
        # Acme: 2 US + 1 IN  → dominant country US; 2 Tech + 1 Finance → Tech
        {"job_id": "a0", "company_name": "Acme", "industry": "Tech",
         "location_country": "US", "batch_date": 20260504},
        {"job_id": "a1", "company_name": "Acme", "industry": "Tech",
         "location_country": "US", "batch_date": 20260504},
        {"job_id": "a2", "company_name": "Acme", "industry": "Finance",
         "location_country": "IN", "batch_date": 20260504},
        # Globex: only IN
        {"job_id": "g0", "company_name": "Globex", "industry": "Energy",
         "location_country": "IN", "batch_date": 20260504},
    ]
    db = _FakeDB({"jobs": jobs, "job_skills": []})
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        result = repo.compile_market_analytics()

    enrichment = result["by_company_enrichment"]
    assert enrichment["Acme"]["country"] == "US"
    # normalize_industry_group canonicalizes "Tech" → "Technology"
    assert enrichment["Acme"]["industry"] == "Technology"
    assert enrichment["Globex"]["country"] == "IN"


def test_compile_market_analytics_caches_within_ttl() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        result1 = repo.compile_market_analytics()

    # Second call within TTL — DB should NOT be hit again (ranges unchanged)
    ranges_after_first = list(db.ranges)
    with patch("app.repositories.jobs.time.monotonic", return_value=1800.0):
        result2 = repo.compile_market_analytics()

    assert result1 is result2
    assert db.ranges == ranges_after_first


def test_compile_market_analytics_invalidates_after_ttl() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        result1 = repo.compile_market_analytics()

    ranges_after_first = list(db.ranges)
    with patch("app.repositories.jobs.time.monotonic", return_value=604801.0):  # just over 7 days
        result2 = repo.compile_market_analytics()

    assert result1 is not result2
    assert len(db.ranges) > len(ranges_after_first)


def test_compile_market_analytics_keyed_by_role_domain() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        repo.compile_market_analytics(role_domain=None)
        repo.compile_market_analytics(role_domain="Engineering")

    assert (None, None, None, None) in jobs_module._analytics_cache
    assert ("Engineering", None, None, None) in jobs_module._analytics_cache


def test_get_candidate_job_ids_for_skills_scopes_correctly() -> None:
    db = _FakeDB({
        "skills": [
            {"id": "s1", "taxonomy_key": "python"},
            {"id": "s2", "taxonomy_key": "sql"},
            {"id": "s3", "taxonomy_key": "excel"},
        ],
        "job_skills": [
            {"job_id": "j1", "skill_id": "s1"},
            {"job_id": "j2", "skill_id": "s2"},
            {"job_id": "j3", "skill_id": "s3"},
            {"job_id": "j1", "skill_id": "s2"},
        ],
        "jobs": [
            {"job_id": "j1", "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
            {"job_id": "j2", "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
        ],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python", "sql"])

    assert set(result) == {"j1", "j2"}


def test_get_candidate_job_ids_for_skills_empty_keys_returns_empty() -> None:
    db = _FakeDB({"skills": [], "job_skills": []})
    assert JobsRepository(db).get_candidate_job_ids_for_skills([]) == []


def test_get_candidate_job_ids_for_skills_no_match_returns_empty() -> None:
    db = _FakeDB({
        "skills": [{"id": "s1", "taxonomy_key": "python"}],
        "job_skills": [{"job_id": "j1", "skill_id": "s1"}],
    })
    assert JobsRepository(db).get_candidate_job_ids_for_skills(["java"]) == []


def test_get_user_skill_demand_snapshot_scopes_to_current_user_skills() -> None:
    db = _FakeDB({
        "user_skills": [
            {
                "user_id": "u1",
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "skills": {"id": 1, "taxonomy_key": "Python", "display_name": "Python"},
            },
            {
                "user_id": "u1",
                "matched_level": 1,
                "proficiency_title": "Scout",
                "skills": {"id": 2, "taxonomy_key": "SQL", "display_name": "SQL"},
            },
            {
                "user_id": "u2",
                "matched_level": 5,
                "proficiency_title": "Legend",
                "skills": {"id": 3, "taxonomy_key": "Go", "display_name": "Go"},
            },
        ],
        "job_skills": [
            {"skill_id": 1, "is_primary": True},
            {"skill_id": 1, "is_primary": False},
            {"skill_id": 2, "is_primary": False},
            {"skill_id": 3, "is_primary": True},
        ],
    })

    result = JobsRepository(db).get_user_skill_demand_snapshot("u1")
    by_skill = {row["skill"]: row for row in result}

    assert set(by_skill) == {"Python", "SQL"}
    assert by_skill["Python"]["job_count_30d"] == 2
    assert by_skill["Python"]["weighted_demand"] == 3
    assert by_skill["SQL"]["job_count_30d"] == 1
    assert by_skill["SQL"]["weighted_demand"] == 1


def test_get_user_skill_demand_snapshot_falls_back_when_rpc_unavailable() -> None:
    # Before the migration is applied the RPC 404s — the row-scan fallback must
    # produce identical counts so the backend is correct either way.
    from postgrest.exceptions import APIError

    class _NoRpcDB(_FakeDB):
        def rpc(self, name: str, params: dict[str, Any]) -> _FakeRpcCall:
            raise APIError({"message": "function count_job_demand_for_skills does not exist"})

    db = _NoRpcDB({
        "user_skills": [
            {
                "user_id": "u1",
                "matched_level": 2,
                "proficiency_title": "Trailblazer",
                "skills": {"id": 1, "taxonomy_key": "Python", "display_name": "Python"},
            },
            {
                "user_id": "u1",
                "matched_level": 1,
                "proficiency_title": "Scout",
                "skills": {"id": 2, "taxonomy_key": "SQL", "display_name": "SQL"},
            },
        ],
        "job_skills": [
            {"skill_id": 1, "is_primary": True},
            {"skill_id": 1, "is_primary": False},
            {"skill_id": 2, "is_primary": False},
        ],
    })

    by_skill = {row["skill"]: row for row in JobsRepository(db).get_user_skill_demand_snapshot("u1")}
    assert by_skill["Python"]["job_count_30d"] == 2
    assert by_skill["Python"]["weighted_demand"] == 3
    assert by_skill["SQL"]["job_count_30d"] == 1
    assert by_skill["SQL"]["weighted_demand"] == 1


def test_get_candidate_job_ids_for_skills_preserves_canonical_case() -> None:
    db = _FakeDB({
        "skills": [
            {"id": "s1", "taxonomy_key": "Python (Programming Language)"},
            {"id": "s2", "taxonomy_key": "SQL (Programming Language)"},
            {"id": "s3", "taxonomy_key": "Stakeholder Management"},
        ],
        "job_skills": [
            {"job_id": "j1", "skill_id": "s1"},
            {"job_id": "j2", "skill_id": "s2"},
            {"job_id": "j3", "skill_id": "s3"},
        ],
        "jobs": [
            {"job_id": "j1", "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
            {"job_id": "j2", "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
        ],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(
        ["Python (Programming Language)", "SQL (Programming Language)"]
    )

    assert set(result) == {"j1", "j2"}


def _fresh_marker(days_ago: int) -> int:
    from datetime import datetime, timedelta, timezone
    return int((datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y%m%d"))


def test_get_candidate_job_ids_for_skills_drops_untrusted_listings() -> None:
    # Only the verifier-active listing reaches ranking/LLM. Scraper age is not
    # the liveness signal; uncertain and closed verifier states are excluded.
    db = _FakeDB({
        "skills": [
            {"id": "s1", "taxonomy_key": "python"},
            {"id": "s2", "taxonomy_key": "sql"},
            {"id": "s3", "taxonomy_key": "excel"},
        ],
        "job_skills": [
            {"job_id": "j1", "skill_id": "s1"},
            {"job_id": "j2", "skill_id": "s2"},
            {"job_id": "j3", "skill_id": "s3"},
        ],
        "jobs": [
            {"job_id": "j1", "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(2)},
            {"job_id": "j2", "is_active": True, "listing_confidence": "uncertain", "last_seen": _fresh_marker(60)},
            {"job_id": "j3", "is_active": False, "listing_confidence": "closed", "last_seen": _fresh_marker(1)},
        ],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python", "sql", "excel"])

    assert set(result) == {"j1"}


def test_get_candidate_job_ids_for_skills_trusts_verifier_over_scraper_age() -> None:
    db = _FakeDB({
        "skills": [{"id": "s1", "taxonomy_key": "python"}],
        "job_skills": [{"job_id": "j1", "skill_id": "s1"}],
        "jobs": [{
            "job_id": "j1",
            "is_active": True,
            "listing_confidence": "active",
            "last_seen": _fresh_marker(90),
        }],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python"])

    assert result == ["j1"]


def test_get_candidate_job_ids_for_skills_returns_empty_when_none_are_trusted() -> None:
    # Trust is a hard gate: an empty honest pool is better than a stale match.
    db = _FakeDB({
        "skills": [{"id": "s1", "taxonomy_key": "python"}],
        "job_skills": [{"job_id": "j1", "skill_id": "s1"}],
        "jobs": [{"job_id": "j1", "is_active": True, "listing_confidence": "uncertain", "last_seen": _fresh_marker(90)}],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python"])

    assert result == []


def test_get_candidate_job_ids_for_skills_require_fresh_false_bypasses_trust_gate() -> None:
    db = _FakeDB({
        "skills": [{"id": "s1", "taxonomy_key": "python"}],
        "job_skills": [{"job_id": "j1", "skill_id": "s1"}],
        "jobs": [{"job_id": "j1", "is_active": True, "listing_confidence": "uncertain", "last_seen": _fresh_marker(90)}],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python"], require_fresh=False)

    assert result == ["j1"]


# ---------------------------------------------------------------------------
# get_candidate_job_ids_for_roles — career-ops title_filter selector
# ---------------------------------------------------------------------------

def _roles_jobs_db(jobs: list[dict[str, Any]]) -> "_FakeDB":
    return _FakeDB({"jobs": jobs})


def test_get_candidate_job_ids_for_roles_precision_matches_title() -> None:
    # Only jobs whose TITLE contains ALL tokens of some target role survive the
    # precision filter — "Sales Engineer" has "engineer" but not "software", so it
    # is NOT a match for "Software Engineer" (no fabricated relevance).
    db = _roles_jobs_db([
        {"job_id": "j1", "job_title": "Software Engineer II", "role_domain": "Engineering",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
        {"job_id": "j2", "job_title": "Senior Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(2)},
        {"job_id": "j3", "job_title": "Sales Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
        {"job_id": "j4", "job_title": "Data Analyst", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
    ])
    result = JobsRepository(db).get_candidate_job_ids_for_roles(["Software Engineer"])
    assert set(result) == {"j1", "j2"}


def test_get_candidate_job_ids_for_roles_drops_untrusted_not_old_listings() -> None:
    db = _roles_jobs_db([
        {"job_id": "j1", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
        {"job_id": "j2", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(90)},
        {"job_id": "j3", "job_title": "Software Engineer", "role_domain": "",
         "is_active": False, "listing_confidence": "closed", "last_seen": _fresh_marker(1)},
        {"job_id": "j4", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "uncertain", "last_seen": _fresh_marker(1)},
    ])
    result = JobsRepository(db).get_candidate_job_ids_for_roles(["Software Engineer"])
    assert result == ["j1", "j2"]


def test_get_candidate_job_ids_for_roles_trusts_verifier_over_scraper_age() -> None:
    db = _roles_jobs_db([{
        "job_id": "j1",
        "job_title": "Software Engineer",
        "role_domain": "",
        "is_active": True,
        "listing_confidence": "active",
        "last_seen": _fresh_marker(90),
    }])

    result = JobsRepository(db).get_candidate_job_ids_for_roles(["Software Engineer"])

    assert result == ["j1"]


def test_get_candidate_job_ids_for_roles_no_roles_returns_empty() -> None:
    db = _roles_jobs_db([
        {"job_id": "j1", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1)},
    ])
    assert JobsRepository(db).get_candidate_job_ids_for_roles([]) == []


def test_get_candidate_job_ids_for_roles_filters_by_location() -> None:
    db = _roles_jobs_db([
        {"job_id": "j1", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1),
         "location_country": "india", "location_mode": "onsite"},
        {"job_id": "j2", "job_title": "Software Engineer", "role_domain": "",
         "is_active": True, "listing_confidence": "active", "last_seen": _fresh_marker(1),
         "location_country": "usa", "location_mode": "onsite"},
    ])
    result = JobsRepository(db).get_candidate_job_ids_for_roles(
        ["Software Engineer"], target_location_countries=["india"]
    )
    assert result == ["j1"]


# ---------------------------------------------------------------------------
# RPC path tests (Bug 2 — PostgREST URL-length 400 fix)
# ---------------------------------------------------------------------------

def test_fetch_job_skill_rows_via_rpc_empty_returns_empty() -> None:
    mock_db = Mock()
    result = fetch_job_skill_rows_via_rpc(mock_db, [])
    assert result == []
    mock_db.rpc.assert_not_called()


def test_fetch_job_skill_rows_via_rpc_adapts_flat_rows() -> None:
    mock_db = Mock()
    mock_db.rpc.return_value.execute.return_value = _Result([
        {"job_id": "j1", "is_primary": True, "taxonomy_key": "python"},
        {"job_id": "j1", "is_primary": False, "taxonomy_key": "sql"},
    ])
    result = fetch_job_skill_rows_via_rpc(mock_db, ["j1"])
    assert result == [
        {"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j1", "is_primary": False, "skills": {"taxonomy_key": "sql"}},
    ]
    mock_db.rpc.assert_called_once_with("fetch_job_skills_by_job_ids", {"job_ids": ["j1"]})


def test_fetch_job_skill_rows_routes_through_rpc_when_job_ids_provided() -> None:
    mock_db = Mock()
    mock_db.rpc.return_value.execute.return_value = _Result([
        {"job_id": "j1", "is_primary": True, "taxonomy_key": "python"},
    ])
    result = fetch_job_skill_rows(mock_db, job_ids=["j1"])
    assert len(result) == 1
    assert result[0]["skills"] == {"taxonomy_key": "python"}
    mock_db.rpc.assert_called_once()
    mock_db.table.assert_not_called()


def test_fetch_job_skill_rows_large_list_uses_rpc_not_in_filter() -> None:
    """5000 job IDs must not hit PostgREST .in_() URL-length limit."""
    job_ids = [str(uuid.uuid4()) for _ in range(5_000)]
    mock_db = Mock()
    mock_db.rpc.return_value.execute.return_value = _Result([])
    result = fetch_job_skill_rows(mock_db, job_ids=job_ids)
    assert result == []
    mock_db.rpc.assert_called_once_with("fetch_job_skills_by_job_ids", {"job_ids": job_ids})
    mock_db.table.assert_not_called()


def test_fetch_job_skill_rows_falls_back_to_chunked_on_rpc_failure() -> None:
    rows = [
        {"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j2", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
    ]
    fake_db = _FakeDB({"job_skills": rows})
    with patch(
        "app.repositories.job_skills_read_model.fetch_job_skill_rows_via_rpc",
        side_effect=Exception("RPC unavailable"),
    ):
        result = fetch_job_skill_rows(fake_db, job_ids=["j1", "j2"])
    assert {r["job_id"] for r in result} == {"j1", "j2"}


def test_fetch_job_skill_rows_disables_rpc_after_missing_signature_error() -> None:
    fake_db = _FakeDB({"job_skills": []})
    missing_exc = Exception(
        "PGRST202: Could not find the function public.fetch_job_skills_by_job_ids(job_ids) in the schema cache"
    )

    job_skills_module._rpc_disabled_for_process = False
    job_skills_module._rpc_missing_logged = False
    try:
        with patch(
            "app.repositories.job_skills_read_model.fetch_job_skill_rows_via_rpc",
            side_effect=missing_exc,
        ) as rpc_call, patch(
            "app.repositories.job_skills_read_model.fetch_job_skill_rows_for_ids",
            return_value=[],
        ) as chunked_call:
            fetch_job_skill_rows(fake_db, job_ids=["j1"])
            fetch_job_skill_rows(fake_db, job_ids=["j1"])
    finally:
        job_skills_module._rpc_disabled_for_process = False
        job_skills_module._rpc_missing_logged = False

    assert rpc_call.call_count == 1
    assert chunked_call.call_count == 2


# ---------------------------------------------------------------------------
# get_job_skills — required_level
# ---------------------------------------------------------------------------

def test_get_job_skills_returns_required_level_from_db() -> None:
    """required_level present in DB → returned as-is, no heuristic."""
    meta_result = _Result({"job_id": "j1", "job_title": "Engineer", "company_name": "Acme"})
    skill_result = _Result([
        {"is_primary": True, "required_level": 3, "skills": {"taxonomy_key": "python"}},
        {"is_primary": False, "required_level": 1, "skills": {"taxonomy_key": "excel"}},
    ])

    mock_db = Mock()
    mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = meta_result
    mock_admin_db = Mock()
    mock_admin_db.table.return_value.select.return_value.eq.return_value.execute.return_value = skill_result

    result = JobsRepository(mock_db, admin_db=mock_admin_db).get_job_skills("j1")

    assert result is not None
    by_key = {s["taxonomy_key"]: s for s in result["skills"]}
    assert by_key["python"]["required_level"] == 3
    assert by_key["python"]["is_primary"] is True
    assert by_key["excel"]["required_level"] == 1
    assert by_key["excel"]["is_primary"] is False


def test_get_job_skills_required_level_fallback_when_null() -> None:
    """required_level null in DB → primary→4, secondary→2 fallback."""
    meta_result = _Result({"job_id": "j1", "job_title": "Engineer", "company_name": "Acme"})
    skill_result = _Result([
        {"is_primary": True, "required_level": None, "skills": {"taxonomy_key": "python"}},
        {"is_primary": False, "required_level": None, "skills": {"taxonomy_key": "excel"}},
    ])

    mock_db = Mock()
    mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = meta_result
    mock_admin_db = Mock()
    mock_admin_db.table.return_value.select.return_value.eq.return_value.execute.return_value = skill_result

    result = JobsRepository(mock_db, admin_db=mock_admin_db).get_job_skills("j1")

    assert result is not None
    by_key = {s["taxonomy_key"]: s for s in result["skills"]}
    assert by_key["python"]["required_level"] == 4
    assert by_key["excel"]["required_level"] == 2


def test_get_job_skills_falls_back_to_main_side_skills_when_no_canonical_rows() -> None:
    """Extension-added job → no canonical job_skills rows → synthesise the gap
    from the taxonomy-validated main_skills/side_skills the importer stored, so
    the Tailor match isn't a phantom 0%."""
    meta_result = _Result({
        "job_id": "ext_1", "job_title": "Account Manager", "company_name": "Amazon",
        "main_skills": ["Account Management", "Amazon Marketplace"],
        "side_skills": ["Cold Calling"],
    })
    skill_result = _Result([])  # no canonical job_skills

    mock_db = Mock()
    mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = meta_result
    mock_admin_db = Mock()
    mock_admin_db.table.return_value.select.return_value.eq.return_value.execute.return_value = skill_result

    result = JobsRepository(mock_db, admin_db=mock_admin_db).get_job_skills("ext_1")

    assert result is not None
    by_key = {s["taxonomy_key"]: s for s in result["skills"]}
    assert by_key["Account Management"]["is_primary"] is True
    assert by_key["Account Management"]["required_level"] == 4
    assert by_key["Cold Calling"]["is_primary"] is False
    assert by_key["Cold Calling"]["required_level"] == 2


def test_get_job_skills_prefers_canonical_over_text_fallback() -> None:
    """When canonical job_skills exist, the main/side text is ignored."""
    meta_result = _Result({
        "job_id": "j1", "job_title": "Engineer", "company_name": "Acme",
        "main_skills": ["Should Be Ignored"], "side_skills": [],
    })
    skill_result = _Result([
        {"is_primary": True, "required_level": 3, "skills": {"taxonomy_key": "python"}},
    ])

    mock_db = Mock()
    mock_db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = meta_result
    mock_admin_db = Mock()
    mock_admin_db.table.return_value.select.return_value.eq.return_value.execute.return_value = skill_result

    result = JobsRepository(mock_db, admin_db=mock_admin_db).get_job_skills("j1")

    assert result is not None
    keys = {s["taxonomy_key"] for s in result["skills"]}
    assert keys == {"python"}
