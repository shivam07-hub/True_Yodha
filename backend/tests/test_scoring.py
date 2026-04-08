"""
test_scoring.py
100% coverage on scoring_engine.py — pure unit tests, no Supabase required.

Five synthetic profiles:
  P1 — Zero XP: Mirror Score = 0
  P2 — Full L5 (all 63 skills at leadership + XP boost): Mirror Score = 100
  P3 — Mixed profile: correct domain + Mirror Score arithmetic
  P4 — Gap analysis: gap_score ordering and undetected high-demand skills
  P5 — Rank tier bands: each tier computed correctly, tier never in schema

DB tests: mock the Supabase client to cover fetch_* and persist_* functions.
"""

from unittest.mock import MagicMock, call

import pytest

from app.services.scoring_engine import (
    _RANK_TIERS,
    _SIGNAL_LEVEL_MAP,
    build_skill_level_map,
    compute_and_persist_score,
    compute_domain_scores,
    compute_gap_skills,
    compute_mirror_score,
    compute_rank_tier,
    fetch_skill_demand,
    fetch_taxonomy,
    infer_level_from_signals,
    persist_score,
    persist_user_skills,
)

# ── Shared taxonomy fixtures ──────────────────────────────────────────────────

ALL_KEYS = ["python", "sql", "data_visualisation", "statistical_analysis", "docker"]

SKILLS_BY_DOMAIN = {
    "DSA": ["sql", "data_visualisation", "statistical_analysis"],
    "SD":  ["python"],
    "CDO": ["docker"],
}

SKILL_DISPLAY = {
    "python":               "Python",
    "sql":                  "SQL",
    "data_visualisation":   "Data Visualisation",
    "statistical_analysis": "Statistical Analysis",
    "docker":               "Docker",
}


# ── Profile 1: Zero XP ────────────────────────────────────────────────────────

class TestZeroXP:
    def test_mirror_score_is_zero(self) -> None:
        assert compute_mirror_score({}, ALL_KEYS) == 0.0

    def test_mirror_score_empty_taxonomy(self) -> None:
        assert compute_mirror_score({"python": 3}, []) == 0.0

    def test_domain_scores_all_zero(self) -> None:
        scores = compute_domain_scores({}, SKILLS_BY_DOMAIN)
        assert all(v == 0.0 for v in scores.values())

    def test_infer_level_no_signals(self) -> None:
        assert infer_level_from_signals([]) == 0

    def test_build_skill_level_map_empty(self) -> None:
        assert build_skill_level_map([]) == {}


# ── Profile 2: Full L5 ────────────────────────────────────────────────────────

class TestFullL5:
    """All 5 keys at leadership signal + enough XP to boost to L5."""

    def _full_signals(self) -> list[dict]:
        return [
            {
                "taxonomy_key": key,
                "signal_type": "leadership",   # base L4
                "xp_awarded": 700,             # 700 XP → total ≥ 1000 when combined
                "evidence": f"Led {key}",
            }
            for key in ALL_KEYS
        ] + [
            {
                "taxonomy_key": key,
                "signal_type": "impact",
                "xp_awarded": 350,             # combined: 1050 XP → boost to L5
                "evidence": f"Measurable impact in {key}",
            }
            for key in ALL_KEYS
        ]

    def test_infer_level_leadership_with_boost(self) -> None:
        signals = [
            {"signal_type": "leadership", "xp_awarded": 700, "taxonomy_key": "python", "evidence": ""},
            {"signal_type": "impact",     "xp_awarded": 350, "taxonomy_key": "python", "evidence": ""},
        ]
        assert infer_level_from_signals(signals) == 5

    def test_mirror_score_is_100(self) -> None:
        level_map = build_skill_level_map(self._full_signals())
        score = compute_mirror_score(level_map, ALL_KEYS)
        assert score == 100.0

    def test_level_capped_at_5(self) -> None:
        # Even with huge XP, level must not exceed 5
        signals = [
            {"signal_type": "leadership", "xp_awarded": 9999, "taxonomy_key": "sql", "evidence": ""},
        ]
        assert infer_level_from_signals(signals) == 5


# ── Profile 3: Mixed profile ─────────────────────────────────────────────────

class TestMixedProfile:
    """
    python:               L4 (leadership, 500 XP — no boost, <1000)
    sql:                  L3 (impact, 350 XP)
    data_visualisation:   L2 (project, 150 XP)
    statistical_analysis: L1 (mention, 50 XP)
    docker:               L0 (not detected)
    """

    SIGNALS = [
        {"taxonomy_key": "python",               "signal_type": "leadership", "xp_awarded": 500, "evidence": "Led backend arch"},
        {"taxonomy_key": "sql",                   "signal_type": "impact",     "xp_awarded": 350, "evidence": "Reduced query time 60%"},
        {"taxonomy_key": "data_visualisation",    "signal_type": "project",    "xp_awarded": 150, "evidence": "Built Tableau dashboards"},
        {"taxonomy_key": "statistical_analysis",  "signal_type": "mention",    "xp_awarded": 50,  "evidence": "Statistical analysis"},
    ]

    def test_skill_levels(self) -> None:
        level_map = build_skill_level_map(self.SIGNALS)
        assert level_map["python"] == 4
        assert level_map["sql"] == 3
        assert level_map["data_visualisation"] == 2
        assert level_map["statistical_analysis"] == 1
        assert level_map.get("docker", 0) == 0

    def test_mirror_score_arithmetic(self) -> None:
        # (4/5*100 + 3/5*100 + 2/5*100 + 1/5*100 + 0/5*100) / 5
        # = (80 + 60 + 40 + 20 + 0) / 5 = 40.0
        level_map = build_skill_level_map(self.SIGNALS)
        score = compute_mirror_score(level_map, ALL_KEYS)
        assert score == 40.0

    def test_domain_scores(self) -> None:
        level_map = build_skill_level_map(self.SIGNALS)
        domain_scores = compute_domain_scores(level_map, SKILLS_BY_DOMAIN)
        # DSA: (sql=60 + data_vis=40 + stats=20) / 3 = 40.0
        assert domain_scores["DSA"] == pytest.approx(40.0)
        # SD: python=80 → 80.0
        assert domain_scores["SD"] == 80.0
        # CDO: docker=0 → 0.0
        assert domain_scores["CDO"] == 0.0

    def test_domain_scores_only_include_known_domains(self) -> None:
        scores = compute_domain_scores({}, SKILLS_BY_DOMAIN)
        assert set(scores.keys()) == {"DSA", "SD", "CDO"}

    def test_empty_key_list_domain_skipped(self) -> None:
        # Domain with empty skills list must be skipped (hits the `continue` branch)
        domains_with_empty = {"SD": ["python"], "EMPTY": []}
        scores = compute_domain_scores({"python": 3}, domains_with_empty)
        assert "EMPTY" not in scores
        assert "SD" in scores


# ── Profile 4: Gap analysis ───────────────────────────────────────────────────

class TestGapAnalysis:
    """
    Verifies gap_score ordering and that undetected high-demand skills appear.
    """

    LEVEL_MAP = {
        "python": 3,           # gap = (5-3) × weight
        "sql":    1,           # gap = (5-1) × weight
        "docker": 0,           # not detected — treated as fully missing
    }

    DEMAND = {
        "python": 100,         # max demand → weight=1.0
        "sql":    50,          # weight=0.5
        "docker": 80,          # weight=0.8 — undetected, should appear
        "data_visualisation": 10,
        "statistical_analysis": 5,
    }

    def test_gap_score_formula(self) -> None:
        gaps = compute_gap_skills(self.LEVEL_MAP, self.DEMAND, SKILL_DISPLAY)
        # sql: (5-1) × 0.5 = 2.0
        sql_gap = next(g for g in gaps if g["taxonomy_key"] == "sql")
        assert sql_gap["gap_score"] == pytest.approx(2.0)

    def test_undetected_skill_included(self) -> None:
        gaps = compute_gap_skills(self.LEVEL_MAP, self.DEMAND, SKILL_DISPLAY)
        keys = [g["taxonomy_key"] for g in gaps]
        assert "docker" in keys

    def test_undetected_skill_target_level_is_1(self) -> None:
        gaps = compute_gap_skills(self.LEVEL_MAP, self.DEMAND, SKILL_DISPLAY)
        docker_gap = next(g for g in gaps if g["taxonomy_key"] == "docker")
        assert docker_gap["current_level"] == 0
        assert docker_gap["target_level"] == 1

    def test_gaps_sorted_descending(self) -> None:
        gaps = compute_gap_skills(self.LEVEL_MAP, self.DEMAND, SKILL_DISPLAY)
        scores = [g["gap_score"] for g in gaps]
        assert scores == sorted(scores, reverse=True)

    def test_top_n_respected(self) -> None:
        gaps = compute_gap_skills(self.LEVEL_MAP, self.DEMAND, SKILL_DISPLAY, top_n=2)
        assert len(gaps) <= 2

    def test_l5_skill_excluded_from_gaps(self) -> None:
        level_map = {"python": 5, "sql": 2}
        demand = {"python": 100, "sql": 80}
        gaps = compute_gap_skills(level_map, demand, SKILL_DISPLAY)
        keys = [g["taxonomy_key"] for g in gaps]
        assert "python" not in keys

    def test_zero_demand_excluded(self) -> None:
        level_map = {"python": 2}
        demand = {"python": 0}
        gaps = compute_gap_skills(level_map, demand, SKILL_DISPLAY)
        assert len(gaps) == 0

    def test_empty_demand(self) -> None:
        gaps = compute_gap_skills({"python": 2}, {}, SKILL_DISPLAY)
        assert gaps == []


# ── Profile 5: Rank tiers ─────────────────────────────────────────────────────

class TestRankTier:
    @pytest.mark.parametrize("score, expected", [
        (0.0,   "Newcomer"),
        (10.0,  "Newcomer"),
        (20.0,  "Newcomer"),
        (21.0,  "Explorer"),
        (40.0,  "Explorer"),
        (41.0,  "Practitioner"),
        (60.0,  "Practitioner"),
        (61.0,  "Specialist"),
        (75.0,  "Specialist"),
        (76.0,  "Professional"),
        (88.0,  "Professional"),
        (89.0,  "Expert"),
        (100.0, "Expert"),
    ])
    def test_tier_bands(self, score: float, expected: str) -> None:
        assert compute_rank_tier(score) == expected

    def test_all_tiers_covered(self) -> None:
        # Every tier in the constant table must be reachable
        tiers_reachable = {compute_rank_tier(float((lo + hi) / 2)) for lo, hi, _ in _RANK_TIERS}
        expected = {tier for _, _, tier in _RANK_TIERS}
        assert tiers_reachable == expected


# ── Signal type coverage ──────────────────────────────────────────────────────

class TestSignalTypes:
    """All 6 signal types produce the correct base level or XP contribution."""

    def test_mention_is_l1(self) -> None:
        s = [{"signal_type": "mention", "xp_awarded": 50, "taxonomy_key": "x", "evidence": ""}]
        assert infer_level_from_signals(s) == 1

    def test_project_is_l2(self) -> None:
        s = [{"signal_type": "project", "xp_awarded": 150, "taxonomy_key": "x", "evidence": ""}]
        assert infer_level_from_signals(s) == 2

    def test_impact_is_l3(self) -> None:
        s = [{"signal_type": "impact", "xp_awarded": 350, "taxonomy_key": "x", "evidence": ""}]
        assert infer_level_from_signals(s) == 3

    def test_leadership_is_l4(self) -> None:
        s = [{"signal_type": "leadership", "xp_awarded": 500, "taxonomy_key": "x", "evidence": ""}]
        assert infer_level_from_signals(s) == 4

    def test_certification_is_l3(self) -> None:
        s = [{"signal_type": "certification", "xp_awarded": 300, "taxonomy_key": "x", "evidence": "AWS cert"}]
        assert infer_level_from_signals(s) == 3

    def test_certification_boosts_to_l4_with_high_xp(self) -> None:
        # cert (300) + impact (350) + project (350) = 1000 XP → base L3 → boosted to L4
        s = [
            {"signal_type": "certification", "xp_awarded": 300, "taxonomy_key": "x", "evidence": "AWS cert"},
            {"signal_type": "impact",        "xp_awarded": 350, "taxonomy_key": "x", "evidence": "Built at scale"},
            {"signal_type": "project",       "xp_awarded": 350, "taxonomy_key": "x", "evidence": ""},
        ]
        assert infer_level_from_signals(s) == 4

    def test_years_experience_contributes_xp(self) -> None:
        # years_experience alone has no level mapping → base L0, but counts toward XP boost
        # Paired with a project signal: base L2, if total XP ≥ 1000 → L3
        s = [
            {"signal_type": "project",          "xp_awarded": 150,  "taxonomy_key": "x", "evidence": ""},
            {"signal_type": "years_experience",  "xp_awarded": 900,  "taxonomy_key": "x", "evidence": "5 years"},
        ]
        # base = L2 (project), total XP = 1050 ≥ 1000 → boosted to L3
        assert infer_level_from_signals(s) == 3

    def test_unknown_signal_type_ignored(self) -> None:
        s = [{"signal_type": "unknown_future_type", "xp_awarded": 999, "taxonomy_key": "x", "evidence": ""}]
        assert infer_level_from_signals(s) == 0

    def test_all_six_in_signal_level_map(self) -> None:
        # Ensure the 5 mapped types are present (years_experience intentionally absent)
        for t in ("mention", "project", "impact", "leadership", "certification"):
            assert t in _SIGNAL_LEVEL_MAP
        assert "years_experience" not in _SIGNAL_LEVEL_MAP


# ── Rank tier out-of-range fallback ──────────────────────────────────────────

class TestRankTierFallback:
    def test_negative_score_returns_newcomer(self) -> None:
        # Fallback branch (line after loop) — score outside all tier bands
        assert compute_rank_tier(-1.0) == "Newcomer"

    def test_score_above_100_returns_newcomer(self) -> None:
        assert compute_rank_tier(101.0) == "Newcomer"


# ── Supabase I/O mocks ────────────────────────────────────────────────────────

def _make_query_mock(data: list[dict]) -> MagicMock:
    """Return a MagicMock that mimics a Supabase fluent query chain ending in .execute()."""
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.order.return_value = q
    q.limit.return_value = q
    q.upsert.return_value = q
    q.insert.return_value = q
    result = MagicMock()
    result.data = data
    q.execute.return_value = result
    return q


class TestFetchTaxonomy:
    def _make_db(self) -> MagicMock:
        rows = [
            {"taxonomy_key": "python",  "display_name": "Python",  "skill_domains": {"code": "SD"}},
            {"taxonomy_key": "sql",     "display_name": "SQL",     "skill_domains": {"code": "DSA"}},
            {"taxonomy_key": "docker",  "display_name": "Docker",  "skill_domains": None},
        ]
        db = MagicMock()
        db.table.return_value = _make_query_mock(rows)
        return db

    def test_all_keys_returned(self) -> None:
        all_keys, _, _ = fetch_taxonomy(self._make_db())
        assert set(all_keys) == {"python", "sql", "docker"}

    def test_by_domain_grouped(self) -> None:
        _, by_domain, _ = fetch_taxonomy(self._make_db())
        assert by_domain["SD"] == ["python"]
        assert by_domain["DSA"] == ["sql"]

    def test_missing_domain_falls_back_to_unknown(self) -> None:
        _, by_domain, _ = fetch_taxonomy(self._make_db())
        assert "docker" in by_domain.get("UNKNOWN", [])

    def test_display_names(self) -> None:
        _, _, display = fetch_taxonomy(self._make_db())
        assert display["python"] == "Python"
        assert display["sql"] == "SQL"


class TestFetchSkillDemand:
    def test_returns_demand_map(self) -> None:
        rows = [
            {"skill_id": 1, "job_count_30d": 120, "skills": {"taxonomy_key": "python"}},
            {"skill_id": 2, "job_count_30d": 80,  "skills": {"taxonomy_key": "sql"}},
            {"skill_id": 3, "job_count_30d": 50,  "skills": None},  # missing skills → skip
        ]
        db = MagicMock()
        db.table.return_value = _make_query_mock(rows)
        demand = fetch_skill_demand(db)
        assert demand == {"python": 120, "sql": 80}

    def test_empty_result(self) -> None:
        db = MagicMock()
        db.table.return_value = _make_query_mock([])
        assert fetch_skill_demand(db) == {}


class TestPersistUserSkills:
    def _make_db(self, skill_rows: list[dict]) -> MagicMock:
        db = MagicMock()
        # First call: db.table("skills") for skill_id lookup
        # Second call: db.table("user_skills") for upsert
        skills_q = _make_query_mock(skill_rows)
        user_skills_q = _make_query_mock([])
        db.table.side_effect = lambda name: skills_q if name == "skills" else user_skills_q
        return db

    def test_returns_count_of_matched_skills(self) -> None:
        skill_rows = [{"taxonomy_key": "python", "id": 1}, {"taxonomy_key": "sql", "id": 2}]
        db = self._make_db(skill_rows)
        level_map = {"python": 3, "sql": 2}
        signals = [
            {"taxonomy_key": "python", "xp_awarded": 350, "signal_type": "impact", "evidence": "Led ETL"},
            {"taxonomy_key": "sql",    "xp_awarded": 150, "signal_type": "project", "evidence": "Queries"},
        ]
        count = persist_user_skills(db, "user-1", level_map, signals)
        assert count == 2

    def test_skips_skills_not_in_db(self) -> None:
        # Only python in DB — docker is unknown
        skill_rows = [{"taxonomy_key": "python", "id": 1}]
        db = self._make_db(skill_rows)
        level_map = {"python": 3, "docker": 2}
        signals = [
            {"taxonomy_key": "python", "xp_awarded": 350, "signal_type": "impact", "evidence": ""},
            {"taxonomy_key": "docker", "xp_awarded": 150, "signal_type": "project", "evidence": ""},
        ]
        count = persist_user_skills(db, "user-1", level_map, signals)
        assert count == 1

    def test_empty_level_map_no_upsert(self) -> None:
        db = self._make_db([])
        count = persist_user_skills(db, "user-1", {}, [])
        assert count == 0


class TestPersistScore:
    def _make_db(self, upsert_result: list[dict]) -> MagicMock:
        db = MagicMock()
        scores_q = _make_query_mock(upsert_result)
        history_q = _make_query_mock([])
        db.table.side_effect = lambda name: scores_q if name == "mirror_scores" else history_q
        return db

    def test_returns_first_data_row_when_present(self) -> None:
        expected = {"user_id": "u1", "total_score": 72.5}
        db = self._make_db([expected])
        result = persist_score(db, "u1", 72.5, {}, [], 5, "Specialist")
        assert result == expected

    def test_returns_constructed_row_when_data_empty(self) -> None:
        db = self._make_db([])
        result = persist_score(db, "u1", 50.0, {"SD": 60.0}, [], 3, "Practitioner")
        assert result["user_id"] == "u1"
        assert result["total_score"] == 50.0
        assert result["rank_tier"] == "Practitioner"

    def test_history_insert_called(self) -> None:
        history_q = _make_query_mock([])
        scores_q = _make_query_mock([{"user_id": "u1", "total_score": 50.0}])
        db = MagicMock()
        db.table.side_effect = lambda name: scores_q if name == "mirror_scores" else history_q
        persist_score(db, "u1", 50.0, {}, [], 0, "Practitioner")
        history_q.insert.assert_called_once()


class TestComputeAndPersistScore:
    """Integration test of the full pipeline via mocks."""

    def _make_db(self) -> MagicMock:
        skills_rows = [
            {"taxonomy_key": "python", "display_name": "Python", "skill_domains": {"code": "SD"}, "id": 1},
        ]
        demand_rows = [
            {"skill_id": 1, "job_count_30d": 100, "skills": {"taxonomy_key": "python"}},
        ]
        user_skills_q = _make_query_mock([])
        scores_q = _make_query_mock([{"user_id": "u1", "total_score": 60.0}])
        history_q = _make_query_mock([])

        skills_q = _make_query_mock(skills_rows)
        demand_q = _make_query_mock(demand_rows)

        call_count = {"n": 0}

        def table_side_effect(name: str) -> MagicMock:
            if name == "skills":
                return skills_q
            if name == "skill_demand_snapshots":
                return demand_q
            if name == "user_skills":
                return user_skills_q
            if name == "mirror_scores":
                return scores_q
            if name == "mirror_score_history":
                return history_q
            return MagicMock()

        db = MagicMock()
        db.table.side_effect = table_side_effect
        return db

    def test_pipeline_returns_score_row(self) -> None:
        db = self._make_db()
        signals = [{"taxonomy_key": "python", "signal_type": "impact", "xp_awarded": 350, "evidence": "Built ETL"}]
        result = compute_and_persist_score(db, "u1", signals)
        assert "total_score" in result

    def test_pipeline_with_empty_signals(self) -> None:
        db = self._make_db()
        result = compute_and_persist_score(db, "u1", [])
        assert result is not None
