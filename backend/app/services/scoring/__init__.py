"""Scoring package — Mirror Score pipeline.

Layered into:
  formulas.py       pure computation (proficiency, cluster, domain, mirror score)
  gap.py            gap analysis + rank tier
  aspirations.py    target-role aspiration inference
  market.py         cached market skill demand
  orchestrator.py   typed facades (record_cv_score, recompute_score, project_score)

The orchestrator is the only public entry point for callers that need to
compute or persist a score. See docs/adr/0002-scoring-facade-split.md.
"""

from app.services.scoring.aspirations import fetch_aspiration_skills
from app.services.scoring.formulas import (
    _DAYS_PER_STEP,
    _PROFICIENCY_TITLES,
    _SIGNAL_LEVEL_MAP,
    _build_cluster_maps,
    build_skill_level_map,
    compute_cluster_scores,
    compute_domain_scores,
    compute_mirror_score,
    infer_level_from_signals,
    project_total_with_skill_bump,
)
from app.services.scoring.gap import (
    _RANK_TIERS,
    compute_gap_skills,
    compute_rank_tier,
)
from app.services.scoring.market import fetch_skill_demand
from app.services.scoring.orchestrator import (
    ScoreProjection,
    project_score,
    recompute_score,
    record_cv_score,
)

__all__ = [
    "_DAYS_PER_STEP",
    "_PROFICIENCY_TITLES",
    "_RANK_TIERS",
    "_SIGNAL_LEVEL_MAP",
    "_build_cluster_maps",
    "build_skill_level_map",
    "compute_cluster_scores",
    "compute_domain_scores",
    "compute_gap_skills",
    "compute_mirror_score",
    "compute_rank_tier",
    "fetch_aspiration_skills",
    "fetch_skill_demand",
    "infer_level_from_signals",
    "project_score",
    "project_total_with_skill_bump",
    "recompute_score",
    "record_cv_score",
    "ScoreProjection",
]
