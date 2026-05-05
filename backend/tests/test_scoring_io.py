"""
test_scoring_io.py
Supabase I/O tests for scoring_engine.py — mocked DB, no network required.

Covers:
  - fetch_skill_demand
  - persist_user_skills
  - persist_score
  - compute_and_persist_score (full pipeline mock)
"""

from unittest.mock import MagicMock, patch

import pytest

from app.repositories.scores import ScoresRepository
from app.services.scoring_engine import (
    compute_and_persist_score,
    fetch_aspiration_skills,
    fetch_skill_demand,
    persist_score,
    persist_user_skills,
)


# ── Helper ────────────────────────────────────────────────────────────────────

def _q(data: list[dict] | dict | None = None) -> MagicMock:
    """
    Fluent Supabase query chain mock.

    .execute() → result.data = data (list or None)
    .single().execute() → result.data = data[0] if list, else data (for single-row selects)
    .maybe_single().execute() → result.data = data[0] if list else data
    """
    q = MagicMock()
    for method in ("select", "eq", "ilike", "order", "limit", "range", "upsert", "insert", "update"):
        getattr(q, method).return_value = q

    list_result = MagicMock()
    list_result.data = data if isinstance(data, list) else ([] if data is None else [data])
    q.execute.return_value = list_result

    single_data = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
    single_result = MagicMock()
    single_result.data = single_data

    sq = MagicMock()
    sq.execute.return_value = single_result
    q.single.return_value = sq
    q.maybe_single.return_value = sq

    return q


# ── fetch_skill_demand ────────────────────────────────────────────────────────

class TestFetchSkillDemand:
    def test_returns_demand_map(self) -> None:
        # job_skills rows: {job_id, is_primary, skills:{taxonomy_key}}
        rows = [
            {"job_id": "j1", "is_primary": True,  "skills": {"taxonomy_key": "Python"}},
            {"job_id": "j1", "is_primary": False, "skills": {"taxonomy_key": "SQL"}},
        ]
        db = MagicMock()
        db.table.return_value = _q(rows)
        result = fetch_skill_demand(ScoresRepository(db))
        # For a single job: main skill weight=2, side skill weight=1.
        assert result["Python"] == 2
        assert result["SQL"] == 1

    def test_none_skills_skipped(self) -> None:
        rows = [{"job_id": "j1", "is_primary": True, "skills": None}]
        db = MagicMock()
        db.table.return_value = _q(rows)
        assert fetch_skill_demand(ScoresRepository(db)) == {}

    def test_empty_result_returns_empty(self) -> None:
        db = MagicMock()
        db.table.return_value = _q([])
        assert fetch_skill_demand(ScoresRepository(db)) == {}

    def test_query_failure_returns_empty(self) -> None:
        q = _q([])
        q.execute.side_effect = RuntimeError("upstream returned html")
        db = MagicMock()
        db.table.return_value = q
        assert fetch_skill_demand(ScoresRepository(db)) == {}


# ── fetch_aspiration_skills ───────────────────────────────────────────────────

class TestFetchAspirationSkills:
    def test_query_failure_returns_empty(self) -> None:
        q = _q([])
        q.execute.side_effect = RuntimeError("upstream returned html")
        db = MagicMock()
        db.table.return_value = q
        assert fetch_aspiration_skills(ScoresRepository(db), ["Data Analyst"]) == {}


# ── persist_user_skills ───────────────────────────────────────────────────────

class TestPersistUserSkills:
    def _make_db(self) -> MagicMock:
        db = MagicMock()
        db.table.return_value = _q([])
        return db

    def test_returns_count_matched(self) -> None:
        signals = [
            {"taxonomy_key": "python", "xp_awarded": 350, "signal_type": "impact", "evidence": "ETL"},
            {"taxonomy_key": "sql",    "xp_awarded": 150, "signal_type": "project", "evidence": ""},
        ]
        with patch("app.services.taxonomy_loader.ensure_skill_in_db", side_effect=[1, 2]):
            count = persist_user_skills(ScoresRepository(self._make_db()), "u1", {"python": 3, "sql": 2}, signals)
        assert count == 2

    def test_skill_not_in_db_skipped(self) -> None:
        signals = [
            {"taxonomy_key": "python", "xp_awarded": 350, "signal_type": "impact", "evidence": ""},
            {"taxonomy_key": "docker", "xp_awarded": 150, "signal_type": "project", "evidence": ""},
        ]
        with patch("app.services.taxonomy_loader.ensure_skill_in_db", side_effect=[1, None]):
            count = persist_user_skills(ScoresRepository(self._make_db()), "u1", {"python": 3, "docker": 2}, signals)
        assert count == 1

    def test_empty_level_map_returns_zero(self) -> None:
        with patch("app.services.taxonomy_loader.ensure_skill_in_db", return_value=None):
            count = persist_user_skills(ScoresRepository(self._make_db()), "u1", {}, [])
        assert count == 0


# ── persist_score ─────────────────────────────────────────────────────────────

class TestPersistScore:
    def _make_db(self, score_row: dict) -> MagicMock:
        scores_q = _q(score_row)   # single dict → .single().execute().data = score_row
        history_q = _q([])
        db = MagicMock()
        db.table.side_effect = lambda name: scores_q if name == "mirror_scores" else history_q
        return db

    def test_returns_score_row(self) -> None:
        expected = {"user_id": "u1", "total_score": 72.5}
        db = self._make_db(expected)
        result = persist_score(ScoresRepository(db), "u1", 72.5, {}, [], 5, "Specialist")
        assert result == expected

    def test_history_insert_called(self) -> None:
        history_q = _q([])
        scores_q = _q({"user_id": "u1", "total_score": 50.0})
        db = MagicMock()
        db.table.side_effect = lambda n: scores_q if n == "mirror_scores" else history_q
        persist_score(ScoresRepository(db), "u1", 50.0, {}, [], 0, "Practitioner")
        history_q.insert.assert_called_once()


# ── compute_and_persist_score (full pipeline) ─────────────────────────────────

class TestComputeAndPersistScore:
    CLUSTER_MAPS = (
        {"Web Frameworks": ["Django", "Flask"]},   # cluster_children
        {"Django": "Web Frameworks", "Flask": "Web Frameworks"},  # skill_to_cluster
        {"Web Frameworks": "IT"},                  # cluster_to_domain
    )

    def _make_db(self) -> MagicMock:
        # fetch_skill_demand reads from job_skills JOIN skills
        demand_q  = _q([{"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "Django"}}])
        scores_q  = _q({"user_id": "u1", "total_score": 20.0})
        history_q = _q([])
        db = MagicMock()
        def _table(name: str) -> MagicMock:
            return {
                "job_skills":           demand_q,
                "mirror_scores":        scores_q,
                "mirror_score_history": history_q,
            }.get(name, _q([]))
        db.table.side_effect = _table
        return db

    def _patch_all(self) -> tuple:
        cluster_patch = patch(
            "app.services.scoring.persistence._build_cluster_maps",
            return_value=self.CLUSTER_MAPS,
        )
        skill_patch = patch(
            "app.services.taxonomy_loader.ensure_skill_in_db",
            return_value=1,
        )
        return cluster_patch, skill_patch

    def test_pipeline_returns_score_row(self) -> None:
        cp, sp = self._patch_all()
        with cp, sp:
            signals = [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}]
            result = compute_and_persist_score(ScoresRepository(self._make_db()), "u1", signals)
            assert "total_score" in result

    def test_pipeline_with_empty_signals(self) -> None:
        cp, sp = self._patch_all()
        with cp, sp:
            result = compute_and_persist_score(ScoresRepository(self._make_db()), "u1", [])
            assert result is not None

    def test_aspiration_skills_passed_through(self) -> None:
        cp, sp = self._patch_all()
        with cp, sp:
            result = compute_and_persist_score(
                ScoresRepository(self._make_db()), "u1", [], aspiration_skills={"Flask": 3}
            )
            assert result is not None

    def test_can_skip_market_lookup(self) -> None:
        cp, sp = self._patch_all()
        scores_q = _q({"user_id": "u1", "total_score": 20.0})
        history_q = _q([])
        db = MagicMock()

        def _table(name: str) -> MagicMock:
            if name == "jobs":
                raise AssertionError("jobs table should not be queried during CV upload scoring")
            return {
                "mirror_scores":        scores_q,
                "mirror_score_history": history_q,
            }.get(name, _q([]))

        db.table.side_effect = _table
        with cp, sp:
            result = compute_and_persist_score(
                ScoresRepository(db),
                "u1",
                [],
                include_market_signals=False,
            )
            assert result is not None

    def test_require_skills_assessed_raises_when_no_rows_persisted(self) -> None:
        cluster_patch = patch(
            "app.services.scoring.persistence._build_cluster_maps",
            return_value=self.CLUSTER_MAPS,
        )
        skill_patch = patch("app.services.taxonomy_loader.ensure_skill_in_db", return_value=None)
        with cluster_patch, skill_patch:
            with pytest.raises(ValueError, match="No valid skills could be persisted"):
                compute_and_persist_score(
                    ScoresRepository(self._make_db()),
                    "u1",
                    [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}],
                    include_market_signals=False,
                    require_skills_assessed=True,
                )

    def test_dry_run_skips_all_persistence_writes(self) -> None:
        cp, sp = self._patch_all()
        with cp, sp, patch("app.services.scoring.persistence.persist_user_skills") as user_skills_patch, patch(
            "app.services.scoring.persistence.persist_score"
        ) as score_patch:
            result = compute_and_persist_score(
                ScoresRepository(self._make_db()),
                "u1",
                [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}],
                include_market_signals=False,
                persist=False,
            )

        user_skills_patch.assert_not_called()
        score_patch.assert_not_called()
        assert result["user_id"] == "u1"
        assert "total_score" in result
        assert "skills_assessed" in result

    def test_dry_run_respects_require_skills_assessed_guard(self) -> None:
        cp, sp = self._patch_all()
        with cp, sp:
            with pytest.raises(ValueError, match="No valid skills could be persisted"):
                compute_and_persist_score(
                    ScoresRepository(self._make_db()),
                    "u1",
                    [],
                    include_market_signals=False,
                    require_skills_assessed=True,
                    persist=False,
                )
