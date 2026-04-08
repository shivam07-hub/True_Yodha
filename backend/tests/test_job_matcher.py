"""
test_job_matcher.py
Unit tests for job_matcher.py pure computation functions.
No Supabase required — DB functions are covered by mock tests.
"""

from unittest.mock import MagicMock

import pytest

from app.services.job_matcher import (
    _match_credit,
    _parse_skills_json,
    compute_overlap_score,
    fetch_skill_display_map,
    fetch_skill_id_map,
    get_top_matches,
)


# ── _match_credit ─────────────────────────────────────────────────────────────

class TestMatchCredit:
    def test_full_credit_when_user_meets_required(self) -> None:
        assert _match_credit(3, 3) == 1.0

    def test_full_credit_when_user_exceeds_required(self) -> None:
        assert _match_credit(5, 3) == 1.0

    def test_partial_credit_below_required(self) -> None:
        assert _match_credit(2, 4) == pytest.approx(0.5)

    def test_zero_credit_when_user_missing_skill(self) -> None:
        assert _match_credit(0, 3) == 0.0

    def test_full_credit_when_required_level_zero(self) -> None:
        assert _match_credit(0, 0) == 1.0


# ── _parse_skills_json ────────────────────────────────────────────────────────

class TestParseSkillsJson:
    def test_list_passthrough(self) -> None:
        data = [{"skill_id": 1, "required_level": 3}]
        assert _parse_skills_json(data) == data

    def test_json_string_parsed(self) -> None:
        assert _parse_skills_json('[{"skill_id": 2, "required_level": 2}]') == [
            {"skill_id": 2, "required_level": 2}
        ]

    def test_none_returns_empty(self) -> None:
        assert _parse_skills_json(None) == []

    def test_invalid_json_string_returns_empty(self) -> None:
        assert _parse_skills_json("not json") == []

    def test_non_array_json_returns_empty(self) -> None:
        assert _parse_skills_json('{"key": "value"}') == []


# ── compute_overlap_score ─────────────────────────────────────────────────────

class TestComputeOverlapScore:
    ID_TO_KEY = {1: "python", 2: "sql", 3: "docker"}

    def test_perfect_match_is_100(self) -> None:
        user = {"python": 3, "sql": 3}
        primary = [{"skill_id": 1, "required_level": 3}, {"skill_id": 2, "required_level": 3}]
        score = compute_overlap_score(user, primary, [], self.ID_TO_KEY)
        assert score == 100.0

    def test_zero_match_is_0(self) -> None:
        user = {}
        primary = [{"skill_id": 1, "required_level": 3}]
        score = compute_overlap_score(user, primary, [], self.ID_TO_KEY)
        assert score == 0.0

    def test_partial_level_gives_partial_score(self) -> None:
        # user has python at L2, job requires L4 → credit = 0.5
        user = {"python": 2}
        primary = [{"skill_id": 1, "required_level": 4}]
        score = compute_overlap_score(user, primary, [], self.ID_TO_KEY)
        assert score == pytest.approx(50.0)

    def test_secondary_skills_half_weight(self) -> None:
        # 1 primary fully matched, 1 secondary fully matched
        # max = 2×1 + 1×1 = 3; actual = 2×1 + 1×1 = 3 → 100%
        user = {"python": 3, "sql": 3}
        primary = [{"skill_id": 1, "required_level": 3}]
        secondary = [{"skill_id": 2, "required_level": 3}]
        score = compute_overlap_score(user, primary, secondary, self.ID_TO_KEY)
        assert score == 100.0

    def test_secondary_partial_reduces_score(self) -> None:
        # primary fully matched (2 pts), secondary 0/1 (0 pts)
        # max = 2 + 1 = 3; actual = 2 + 0 = 2 → 66.7%
        user = {"python": 3}
        primary = [{"skill_id": 1, "required_level": 3}]
        secondary = [{"skill_id": 2, "required_level": 3}]
        score = compute_overlap_score(user, primary, secondary, self.ID_TO_KEY)
        assert score == pytest.approx(66.7, abs=0.1)

    def test_empty_job_skills_returns_zero(self) -> None:
        user = {"python": 5}
        score = compute_overlap_score(user, [], [], self.ID_TO_KEY)
        assert score == 0.0

    def test_unknown_skill_id_counts_against_score(self) -> None:
        # skill_id 99 not in id_to_key — no match credit, but still in denominator
        # (unidentified required skills reduce score — you can't demonstrate them)
        user = {"python": 3}
        primary = [{"skill_id": 99, "required_level": 3}, {"skill_id": 1, "required_level": 3}]
        score = compute_overlap_score(user, primary, [], self.ID_TO_KEY)
        # max = 2×2 = 4; matched = 2×1 (python) = 2 → 50%
        assert score == pytest.approx(50.0)


# ── DB mock helpers ───────────────────────────────────────────────────────────

def _make_query(data: list[dict]) -> MagicMock:
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.limit.return_value = q
    result = MagicMock()
    result.data = data
    q.execute.return_value = result
    return q


# ── fetch_skill_id_map ────────────────────────────────────────────────────────

class TestFetchSkillIdMap:
    def test_returns_id_to_key_map(self) -> None:
        db = MagicMock()
        db.table.return_value = _make_query([
            {"id": 1, "taxonomy_key": "python"},
            {"id": 2, "taxonomy_key": "sql"},
        ])
        result = fetch_skill_id_map(db)
        assert result == {1: "python", 2: "sql"}

    def test_empty_result(self) -> None:
        db = MagicMock()
        db.table.return_value = _make_query([])
        assert fetch_skill_id_map(db) == {}


# ── fetch_skill_display_map ───────────────────────────────────────────────────

class TestFetchSkillDisplayMap:
    def test_returns_key_to_display(self) -> None:
        db = MagicMock()
        db.table.return_value = _make_query([
            {"taxonomy_key": "python", "display_name": "Python"},
        ])
        result = fetch_skill_display_map(db)
        assert result == {"python": "Python"}


# ── get_top_matches ───────────────────────────────────────────────────────────

class TestGetTopMatches:
    def _make_db(self, skill_rows: list[dict], job_rows: list[dict]) -> MagicMock:
        skills_q = _make_query(skill_rows)
        jobs_q = _make_query(job_rows)
        db = MagicMock()
        db.table.side_effect = lambda name: skills_q if name == "skills" else jobs_q
        return db

    def test_returns_top_n(self) -> None:
        skill_rows = [{"id": 1, "taxonomy_key": "python"}]
        job_rows = [
            {
                "id": i, "title": f"Job {i}", "company": "Co", "location": None,
                "remote": False, "source_url": None, "description": "",
                "primary_skills": [{"skill_id": 1, "required_level": 3}],
                "secondary_skills": [],
            }
            for i in range(1, 6)
        ]
        db = self._make_db(skill_rows, job_rows)
        results = get_top_matches(db, {"python": 3}, top_n=3)
        assert len(results) == 3

    def test_sorted_by_overlap_desc(self) -> None:
        skill_rows = [{"id": 1, "taxonomy_key": "python"}, {"id": 2, "taxonomy_key": "sql"}]
        job_rows = [
            {
                "id": 1, "title": "Partial", "company": None, "location": None,
                "remote": False, "source_url": None, "description": "",
                "primary_skills": [{"skill_id": 1, "required_level": 3}, {"skill_id": 2, "required_level": 3}],
                "secondary_skills": [],
            },
            {
                "id": 2, "title": "Full", "company": None, "location": None,
                "remote": False, "source_url": None, "description": "",
                "primary_skills": [{"skill_id": 1, "required_level": 3}],
                "secondary_skills": [],
            },
        ]
        db = self._make_db(skill_rows, job_rows)
        # User has python but not sql
        results = get_top_matches(db, {"python": 3}, top_n=10)
        # "Full" (only python required) should score higher than "Partial" (python + sql required)
        assert results[0]["title"] == "Full"

    def test_no_jobs_returns_empty(self) -> None:
        db = self._make_db([{"id": 1, "taxonomy_key": "python"}], [])
        results = get_top_matches(db, {"python": 3})
        assert results == []

    def test_description_truncated_to_1500_chars(self) -> None:
        skill_rows = [{"id": 1, "taxonomy_key": "python"}]
        long_desc = "x" * 3000
        job_rows = [{
            "id": 1, "title": "Job", "company": None, "location": None,
            "remote": False, "source_url": None, "description": long_desc,
            "primary_skills": [], "secondary_skills": [],
        }]
        db = self._make_db(skill_rows, job_rows)
        results = get_top_matches(db, {})
        assert len(results[0]["description"]) == 1500
