"""
test_scoring.py
Pure formula unit tests for scoring_engine.py — no Supabase required.

Covers:
  - Cluster coverage scoring (Tax-L2 level)
  - Domain score aggregation (Tax-L1 level)
  - Mirror Score (mean of domain scores)
  - Gap analysis (aspiration-driven, 7-day budget)
  - Rank tiers
  - Signal type → proficiency level
  - XP boost logic
"""

import pytest

from app.services.scoring_engine import (
    _DAYS_PER_STEP,
    _PROFICIENCY_TITLES,
    _RANK_TIERS,
    _SIGNAL_LEVEL_MAP,
    build_skill_level_map,
    compute_cluster_scores,
    compute_domain_scores,
    compute_gap_skills,
    compute_mirror_score,
    compute_rank_tier,
    infer_level_from_signals,
)

# ── Shared taxonomy fixtures ──────────────────────────────────────────────────

# Synthetic 3-cluster, 2-domain taxonomy (3 skills each cluster)
CLUSTER_CHILDREN = {
    "Web Frameworks": ["Django", "Flask", "FastAPI"],
    "Databases":      ["SQL", "PostgreSQL", "MySQL"],
    "Cloud":          ["AWS", "GCP", "Azure"],
}
SKILL_TO_CLUSTER = {
    "Django": "Web Frameworks", "Flask": "Web Frameworks", "FastAPI": "Web Frameworks",
    "SQL": "Databases", "PostgreSQL": "Databases", "MySQL": "Databases",
    "AWS": "Cloud", "GCP": "Cloud", "Azure": "Cloud",
}
CLUSTER_TO_DOMAIN = {
    "Web Frameworks": "IT",
    "Databases":      "IT",
    "Cloud":          "Engineering",
}


# ── Cluster Score ─────────────────────────────────────────────────────────────

class TestClusterScores:
    def test_single_skill_p3(self) -> None:
        # log_coverage=log(2)/log(4)=0.5, proficiency=3/5=0.6 → 0.6*(0.3+0.7*0.5)=0.39
        scores = compute_cluster_scores({"Django": 3}, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert scores["Web Frameworks"] == pytest.approx(0.6 * (0.3 + 0.7 * 0.5), rel=1e-3)

    def test_full_cluster_p4(self) -> None:
        # full coverage: log_coverage=1.0, proficiency=4/5=0.8 → 0.8*(0.3+0.7*1.0)=0.8
        level_map = {"Django": 4, "Flask": 4, "FastAPI": 4}
        scores = compute_cluster_scores(level_map, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert scores["Web Frameworks"] == pytest.approx(0.8)

    def test_partial_cluster_uses_max_proficiency(self) -> None:
        # Django P2, Flask P4 → max_proficiency=4/5=0.8, log_coverage=log(3)/log(4)=0.7925
        import math
        log_cov = math.log1p(2) / math.log1p(3)
        level_map = {"Django": 2, "Flask": 4}
        scores = compute_cluster_scores(level_map, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert scores["Web Frameworks"] == pytest.approx(0.8 * (0.3 + 0.7 * log_cov), rel=1e-3)

    def test_empty_skill_map_returns_empty(self) -> None:
        assert compute_cluster_scores({}, CLUSTER_CHILDREN, SKILL_TO_CLUSTER) == {}

    def test_unknown_skill_not_in_any_cluster(self) -> None:
        scores = compute_cluster_scores({"UnknownSkill": 3}, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert scores == {}

    def test_multiple_clusters_scored_independently(self) -> None:
        level_map = {"Django": 3, "SQL": 2}
        scores = compute_cluster_scores(level_map, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert "Web Frameworks" in scores
        assert "Databases" in scores
        assert scores["Web Frameworks"] != scores["Databases"]

    def test_zero_level_skill_gives_zero_cluster_score(self) -> None:
        scores = compute_cluster_scores({"Django": 0}, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        assert scores.get("Web Frameworks", 0.0) == pytest.approx(0.0)


# ── Domain Score ──────────────────────────────────────────────────────────────

class TestDomainScores:
    def test_single_cluster_domain(self) -> None:
        # Cloud cluster in Engineering domain, score=0.6 → domain=60.0
        cluster_scores = {"Cloud": 0.6}
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        assert domain_scores["Engineering"] == pytest.approx(60.0)

    def test_two_clusters_same_domain(self) -> None:
        # Web Frameworks=0.2, Databases=0.4 both in IT, 1 skill each (default)
        # weighted_mean=0.3, breadth=log1p(1)/log1p(19)=0.231 → 0.3×1.116×100=33.5
        import math
        cluster_scores = {"Web Frameworks": 0.2, "Databases": 0.4}
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        breadth = math.log1p(1) / math.log1p(19)
        expected = round(0.3 * (1.0 + 0.5 * breadth) * 100, 1)
        assert domain_scores["IT"] == pytest.approx(expected, rel=1e-2)

    def test_more_skills_in_domain_scores_higher(self) -> None:
        # Same cluster scores, but more skills → higher domain score
        cluster_scores = {"Web Frameworks": 0.2, "Databases": 0.2}
        few_counts = {"Web Frameworks": 1, "Databases": 1}
        many_counts = {"Web Frameworks": 5, "Databases": 5}
        few_score = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN, few_counts)
        many_score = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN, many_counts)
        assert many_score["IT"] > few_score["IT"]

    def test_absent_domain_not_included(self) -> None:
        cluster_scores = {"Cloud": 0.5}
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        assert "IT" not in domain_scores

    def test_empty_cluster_scores_returns_empty(self) -> None:
        assert compute_domain_scores({}, CLUSTER_TO_DOMAIN) == {}

    def test_unknown_cluster_falls_back_to_general(self) -> None:
        cluster_scores = {"SomeUnknownCluster": 0.5}
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        assert "General" in domain_scores


# ── Mirror Score ──────────────────────────────────────────────────────────────

class TestMirrorScore:
    def test_empty_returns_zero(self) -> None:
        assert compute_mirror_score({}) == 0.0

    def test_single_domain(self) -> None:
        assert compute_mirror_score({"IT": 60.0}) == 60.0

    def test_two_domains_averaged(self) -> None:
        assert compute_mirror_score({"IT": 30.0, "Engineering": 60.0}) == pytest.approx(45.0)

    def test_all_100_returns_100(self) -> None:
        assert compute_mirror_score({"A": 100.0, "B": 100.0}) == 100.0

    def test_full_pipeline_cluster_to_mirror(self) -> None:
        # Django P3 in Web Frameworks (IT domain)
        # log_coverage=0.5, cluster_score=0.6*(0.3+0.7*0.5)=0.39
        # domain_score IT = 0.39 × 100 = 39.0, mirror = 39.0
        level_map = {"Django": 3}
        cluster_scores = compute_cluster_scores(level_map, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        mirror = compute_mirror_score(domain_scores)
        assert mirror == pytest.approx(39.0, rel=1e-2)

    def test_zero_level_skills_score_zero(self) -> None:
        level_map = {"Django": 0, "SQL": 0}
        cluster_scores = compute_cluster_scores(level_map, CLUSTER_CHILDREN, SKILL_TO_CLUSTER)
        domain_scores = compute_domain_scores(cluster_scores, CLUSTER_TO_DOMAIN)
        assert compute_mirror_score(domain_scores) == pytest.approx(0.0)


# ── Gap Analysis ──────────────────────────────────────────────────────────────

class TestGapAnalysis:
    SKILL_DEMAND = {
        "Django": 100, "SQL": 80, "AWS": 60,
        "Flask": 40,   "GCP": 20,
    }

    def test_aspiration_skill_missing_from_cv(self) -> None:
        gaps = compute_gap_skills(
            {}, self.SKILL_DEMAND, {"Django": 3}, SKILL_TO_CLUSTER
        )
        assert any(g["taxonomy_key"] == "Django" for g in gaps)

    def test_days_to_close_scout_to_trailblazer(self) -> None:
        # P1→P2 = 2 days
        gaps = compute_gap_skills(
            {"Django": 1}, self.SKILL_DEMAND, {"Django": 2}, SKILL_TO_CLUSTER
        )
        dj = next(g for g in gaps if g["taxonomy_key"] == "Django")
        assert dj["days_to_close"] == _DAYS_PER_STEP[(1, 2)]

    def test_days_to_close_trailblazer_to_excavator(self) -> None:
        # P2→P3 = 5 days
        gaps = compute_gap_skills(
            {"SQL": 2}, self.SKILL_DEMAND, {"SQL": 3}, SKILL_TO_CLUSTER
        )
        sql = next(g for g in gaps if g["taxonomy_key"] == "SQL")
        assert sql["days_to_close"] == 5

    def test_7_day_budget_not_exceeded(self) -> None:
        aspiration = {"Django": 3, "SQL": 3, "AWS": 3, "Flask": 3, "GCP": 3}
        gaps = compute_gap_skills(
            {}, self.SKILL_DEMAND, aspiration, SKILL_TO_CLUSTER, max_days=7
        )
        assert sum(g["days_allocated"] for g in gaps) <= 7

    def test_skill_at_target_excluded(self) -> None:
        gaps = compute_gap_skills(
            {"Django": 3}, self.SKILL_DEMAND, {"Django": 3}, SKILL_TO_CLUSTER
        )
        assert not any(g["taxonomy_key"] == "Django" for g in gaps)

    def test_skill_above_target_excluded(self) -> None:
        gaps = compute_gap_skills(
            {"Django": 4}, self.SKILL_DEMAND, {"Django": 3}, SKILL_TO_CLUSTER
        )
        assert not any(g["taxonomy_key"] == "Django" for g in gaps)

    def test_top_n_respected(self) -> None:
        aspiration = {s: 3 for s in ["Django", "SQL", "AWS", "Flask", "GCP"]}
        gaps = compute_gap_skills({}, self.SKILL_DEMAND, aspiration, SKILL_TO_CLUSTER, top_n=2)
        assert len(gaps) <= 2

    def test_proficiency_titles_set_correctly(self) -> None:
        gaps = compute_gap_skills(
            {"Django": 1}, self.SKILL_DEMAND, {"Django": 3}, SKILL_TO_CLUSTER
        )
        dj = next(g for g in gaps if g["taxonomy_key"] == "Django")
        assert dj["current_title"] == "Scout"
        assert dj["target_title"] == "Excavator"

    def test_fallback_no_aspiration_uses_demand(self) -> None:
        level_map = {"Django": 1}
        gaps = compute_gap_skills(level_map, self.SKILL_DEMAND, {}, SKILL_TO_CLUSTER)
        assert len(gaps) > 0

    def test_empty_demand_fallback_returns_empty(self) -> None:
        gaps = compute_gap_skills({"Django": 2}, {}, {}, SKILL_TO_CLUSTER)
        assert gaps == []


# ── Rank Tiers ────────────────────────────────────────────────────────────────

class TestRankTier:
    @pytest.mark.parametrize("score, expected", [
        (0.0,   "Newcomer"),
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

    def test_all_tiers_reachable(self) -> None:
        tiers_hit = {compute_rank_tier(float((lo + hi) / 2)) for lo, hi, _ in _RANK_TIERS}
        assert tiers_hit == {t for _, _, t in _RANK_TIERS}

    def test_out_of_range_returns_newcomer(self) -> None:
        assert compute_rank_tier(-1.0) == "Newcomer"
        assert compute_rank_tier(101.0) == "Newcomer"


# ── Signal types → Proficiency level ─────────────────────────────────────────

class TestSignalTypes:
    def test_mention_is_p1_scout(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "mention", "xp_awarded": 50, "taxonomy_key": "x", "evidence": ""}]
        ) == 1

    def test_project_is_p2_trailblazer(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "project", "xp_awarded": 150, "taxonomy_key": "x", "evidence": ""}]
        ) == 2

    def test_impact_is_p3_excavator(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "impact", "xp_awarded": 350, "taxonomy_key": "x", "evidence": ""}]
        ) == 3

    def test_leadership_is_p4_cartographer(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "leadership", "xp_awarded": 500, "taxonomy_key": "x", "evidence": ""}]
        ) == 4

    def test_certification_is_p3_excavator(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "certification", "xp_awarded": 300, "taxonomy_key": "x", "evidence": "AWS"}]
        ) == 3

    def test_xp_boost_pushes_one_level_higher(self) -> None:
        # leadership (P4) + enough XP → P5 Legend
        signals = [
            {"signal_type": "leadership", "xp_awarded": 700, "taxonomy_key": "x", "evidence": ""},
            {"signal_type": "impact",     "xp_awarded": 350, "taxonomy_key": "x", "evidence": ""},
        ]
        assert infer_level_from_signals(signals) == 5

    def test_level_capped_at_5(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "leadership", "xp_awarded": 9999, "taxonomy_key": "x", "evidence": ""}]
        ) == 5

    def test_years_experience_contributes_xp_only(self) -> None:
        # project (P2) + years_experience XP → total 1050 ≥ 1000 → boosted to P3
        signals = [
            {"signal_type": "project",          "xp_awarded": 150, "taxonomy_key": "x", "evidence": ""},
            {"signal_type": "years_experience",  "xp_awarded": 900, "taxonomy_key": "x", "evidence": "5 yrs"},
        ]
        assert infer_level_from_signals(signals) == 3

    def test_unknown_signal_type_ignored(self) -> None:
        assert infer_level_from_signals(
            [{"signal_type": "future_unknown", "xp_awarded": 999, "taxonomy_key": "x", "evidence": ""}]
        ) == 0

    def test_empty_signals_returns_zero(self) -> None:
        assert infer_level_from_signals([]) == 0

    def test_years_experience_absent_from_level_map(self) -> None:
        assert "years_experience" not in _SIGNAL_LEVEL_MAP

    def test_all_mapped_signal_types_present(self) -> None:
        for t in ("mention", "project", "impact", "leadership", "certification"):
            assert t in _SIGNAL_LEVEL_MAP


# ── Proficiency title constants ───────────────────────────────────────────────

class TestProficiencyTitles:
    def test_all_five_levels_named(self) -> None:
        assert _PROFICIENCY_TITLES[1] == "Scout"
        assert _PROFICIENCY_TITLES[2] == "Trailblazer"
        assert _PROFICIENCY_TITLES[3] == "Excavator"
        assert _PROFICIENCY_TITLES[4] == "Cartographer"
        assert _PROFICIENCY_TITLES[5] == "Legend"

    def test_days_table_covers_all_steps(self) -> None:
        for step in [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]:
            assert step in _DAYS_PER_STEP

    def test_days_increase_with_level(self) -> None:
        steps = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
        days = [_DAYS_PER_STEP[s] for s in steps]
        assert days == sorted(days)
