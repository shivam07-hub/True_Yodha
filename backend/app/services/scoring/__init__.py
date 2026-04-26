"""
Scoring package — Mirror Score pipeline.

Layered into:
  formulas.py     pure computation (proficiency, cluster, domain, mirror score)
  gap.py          gap analysis + rank tier
  persistence.py  Supabase I/O + the compute_and_persist_score orchestrator
"""

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
)
from app.services.scoring.gap import (
    _RANK_TIERS,
    compute_gap_skills,
    compute_rank_tier,
)
from app.services.scoring.persistence import (
    compute_and_persist_score,
    fetch_aspiration_skills,
    fetch_skill_demand,
    persist_score,
    persist_user_skills,
)

__all__ = [
    "_DAYS_PER_STEP",
    "_PROFICIENCY_TITLES",
    "_RANK_TIERS",
    "_SIGNAL_LEVEL_MAP",
    "_build_cluster_maps",
    "build_skill_level_map",
    "compute_and_persist_score",
    "compute_cluster_scores",
    "compute_domain_scores",
    "compute_gap_skills",
    "compute_mirror_score",
    "compute_rank_tier",
    "fetch_aspiration_skills",
    "fetch_skill_demand",
    "infer_level_from_signals",
    "persist_score",
    "persist_user_skills",
]
