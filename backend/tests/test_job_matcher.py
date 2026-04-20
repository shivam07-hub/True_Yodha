"""
test_job_matcher.py
Unit tests for job_matcher.get_top_matches.
No Supabase required — DB is fully mocked.
"""

from unittest.mock import MagicMock

import pytest

from app.services.job_matcher import get_top_matches


# ── Mock helpers ──────────────────────────────────────────────────────────────

def _make_db(job_rows_p1: list[dict], job_rows_p2: list[dict] | None = None) -> MagicMock:
    """Build a mock Supabase client that returns job rows across two pages."""
    p2 = job_rows_p2 or []

    call_count = {"n": 0}

    def _range(start: int, end: int) -> MagicMock:
        q = MagicMock()
        result = MagicMock()
        result.data = job_rows_p1 if start == 0 else p2
        q.execute.return_value = result
        return q

    select_mock = MagicMock()
    select_mock.range.side_effect = _range

    table_mock = MagicMock()
    table_mock.select.return_value = select_mock

    db = MagicMock()
    db.table.return_value = table_mock
    return db


def _job(job_id: str, title: str, company: str, main: list[str], side: list[str], location: str = "India") -> dict:
    return {
        "job_id": job_id,
        "job_title": title,
        "company_name": company,
        "industry": "Tech",
        "location": location,
        "apply_url": None,
        "job_description": "Description text",
        "main_skills": main,
        "side_skills": side,
    }


# ── Basic behaviour ───────────────────────────────────────────────────────────

class TestBasic:
    def test_empty_user_skill_map_returns_empty(self) -> None:
        db = _make_db([_job("j1", "DE Role", "Acme", ["Python"], [])])
        assert get_top_matches(db, {}) == []

    def test_jobs_with_no_skills_dropped(self) -> None:
        db = _make_db([_job("j1", "Mystery", "Acme", [], [])])
        assert get_top_matches(db, {"Python": 3}) == []

    def test_returns_at_most_top_n(self) -> None:
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python"], []) for i in range(10)]
        db = _make_db(jobs)
        result = get_top_matches(db, {"Python": 3}, top_n=5)
        assert len(result) == 5

    def test_sorted_by_overlap_desc(self) -> None:
        jobs = [
            _job("j1", "Partial", "Acme", ["Python", "SQL"], []),
            _job("j2", "Full",    "Acme", ["Python"],        []),
        ]
        db = _make_db(jobs)
        result = get_top_matches(db, {"Python": 3}, top_n=10)
        assert result[0]["title"] == "Full"

    def test_matched_skills_field_populated(self) -> None:
        db = _make_db([_job("j1", "Job", "Acme", ["Python", "SQL"], ["Docker"])])
        result = get_top_matches(db, {"Python": 3, "Docker": 2}, top_n=1)
        assert len(result) == 1
        matched = set(result[0]["matched_skills"])
        assert "Python" in matched
        assert "Docker" in matched
        assert "SQL" not in matched

    def test_returned_shape(self) -> None:
        db = _make_db([_job("abc123", "DE", "TechCorp", ["Python"], [])])
        result = get_top_matches(db, {"Python": 3}, top_n=1)
        keys = {"job_id", "title", "company", "location", "industry", "apply_url", "description", "overlap_score", "matched_skills"}
        assert keys.issubset(result[0].keys())
        assert result[0]["job_id"] == "abc123"

    def test_boosted_score_not_in_output(self) -> None:
        db = _make_db([_job("j1", "Job", "Acme", ["Python"], [])])
        result = get_top_matches(db, {"Python": 3})
        assert "boosted_score" not in result[0]


# ── Aspiration rerank ─────────────────────────────────────────────────────────

class TestAspirationRerank:
    def test_role_boost_applied_when_title_matches(self) -> None:
        jobs = [
            _job("j1", "Data Engineer India", "Acme",  ["Python"], []),
            _job("j2", "Sales Executive",     "Other", ["Python"], []),
        ]
        db = _make_db(jobs)
        # Without boost j1==j2 (same skills). With boost j1 wins.
        result = get_top_matches(db, {"Python": 3}, target_roles=["Data Engineer"], top_n=2)
        assert result[0]["job_id"] == "j1"

    def test_location_boost_applied_for_exact_match(self) -> None:
        jobs = [
            _job("j1", "Analyst", "Acme",  ["Python"], [], location="Mumbai, India"),
            _job("j2", "Analyst", "Other", ["Python"], [], location="London, UK"),
        ]
        db = _make_db(jobs)
        result = get_top_matches(db, {"Python": 3}, target_location="India", top_n=2)
        assert result[0]["job_id"] == "j1"

    def test_location_boost_applied_for_remote(self) -> None:
        jobs = [
            _job("j1", "Analyst", "Acme",  ["Python"], [], location="Remote - Worldwide"),
            _job("j2", "Analyst", "Other", ["Python"], [], location="London, UK"),
        ]
        db = _make_db(jobs)
        result = get_top_matches(db, {"Python": 3}, target_location="India", top_n=2)
        assert result[0]["job_id"] == "j1"


# ── Anti-bias company cap ─────────────────────────────────────────────────────

class TestCompanyCap:
    def test_single_company_capped_at_30_percent(self) -> None:
        # 8 Accenture jobs + 2 others, all with same skill → without cap Accenture takes 8/10
        accenture_jobs = [_job(f"acc{i}", f"Role {i}", "Accenture", ["Python"], []) for i in range(8)]
        other_jobs = [
            _job("oth1", "DE Role",  "Wipro", ["Python"], []),
            _job("oth2", "PM Role",  "Infosys", ["Python"], []),
        ]
        db = _make_db(accenture_jobs + other_jobs)
        result = get_top_matches(db, {"Python": 3}, top_n=10)
        accenture_count = sum(1 for r in result if r["company"] == "Accenture")
        assert accenture_count <= 3  # 30% of 10

    def test_cap_does_not_reduce_variety_when_companies_diverse(self) -> None:
        jobs = [_job(f"j{i}", f"Job {i}", f"Co{i}", ["Python"], []) for i in range(10)]
        db = _make_db(jobs)
        result = get_top_matches(db, {"Python": 3}, top_n=10)
        assert len(result) == 10
