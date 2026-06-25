"""Scoring facade — typed entry points into the canonical Mirror Score engine.

Three intents:
  - record_cv_score   CV ingest: write user_skills + score
  - recompute_score   user_skills state changed: rerun math + persist score
  - project_score     pure math, no writes (tests + future what-if previews)

All three converge on the same private math + persistence so the score
remains canonically derived (OQ4). See docs/adr/0002-scoring-facade-split.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.repositories.scores import ScoresRepository
from app.services.scoring.aspirations import fetch_aspiration_skills
from app.services.scoring.formulas import (
    _PROFICIENCY_TITLES,
    _build_cluster_maps,
    build_skill_level_map,
    compute_cluster_scores,
    compute_domain_scores,
    compute_mirror_score,
    project_total_with_skill_bump,
)
from app.services.scoring.gap import compute_gap_skills, compute_rank_tier
from app.services.scoring.market import fetch_skill_demand


@dataclass(frozen=True)
class ScoreProjection:
    total_score: float
    domain_scores: dict[str, float]
    gap_skills: list[dict]
    rank_tier: str
    skills_assessed: int


# ── Facades ───────────────────────────────────────────────────────────────────


def record_cv_score(
    scores_repo: ScoresRepository,
    user_id: str,
    skills_detected: list[dict],
) -> dict:
    """CV ingest path. Infers levels from raw signals, writes user_skills + score.

    Raises ValueError when zero skills can be persisted (caller maps to 422).
    """
    skill_level_map = build_skill_level_map(skills_detected)
    skill_rows = _build_user_skill_rows(scores_repo, user_id, skill_level_map, skills_detected)
    if not skill_rows:
        raise ValueError("No valid skills could be persisted for this user.")

    projection = _score_math(
        scores_repo,
        skill_level_map,
        aspiration_skills={},
        include_market_signals=False,
        skills_assessed_override=len(skill_rows),
    )
    score_row = _persist_score(scores_repo, user_id, projection)
    scores_repo.upsert_user_skill_rows(skill_rows)
    return score_row


def recompute_score(scores_repo: ScoresRepository, user_id: str) -> dict:
    """Recompute path. Reads user_skills + target_roles, writes mirror_scores only.

    Used by skill correction, manual recompute, diary submit, tracker outcome.
    """
    inputs = scores_repo.get_recompute_inputs(user_id)
    aspiration = fetch_aspiration_skills(scores_repo, inputs.target_roles)
    projection = _score_math(
        scores_repo,
        inputs.skill_level_map,
        aspiration_skills=aspiration,
        include_market_signals=True,
    )
    return _persist_score(scores_repo, user_id, projection)


def project_score(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    aspiration_skills: dict[str, int] | None = None,
    include_market_signals: bool = True,
) -> ScoreProjection:
    """Pure math, no writes. Tests + future what-if UX."""
    return _score_math(
        scores_repo,
        skill_level_map,
        aspiration_skills=aspiration_skills or {},
        include_market_signals=include_market_signals,
    )


# ── Private internals ─────────────────────────────────────────────────────────


def _score_math(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    *,
    aspiration_skills: dict[str, int],
    include_market_signals: bool,
    skills_assessed_override: int | None = None,
) -> ScoreProjection:
    cluster_children, skill_to_cluster, cluster_to_domain = _build_cluster_maps()
    demand_scope = set(skill_level_map) | set(aspiration_skills)
    skill_demand = (
        fetch_skill_demand(scores_repo, demand_scope) if include_market_signals else {}
    )

    cluster_scores = compute_cluster_scores(skill_level_map, cluster_children, skill_to_cluster)
    cluster_skill_counts = {
        cluster: sum(1 for s in skill_level_map if skill_to_cluster.get(s) == cluster)
        for cluster in cluster_scores
    }
    domain_scores = compute_domain_scores(cluster_scores, cluster_to_domain, cluster_skill_counts)
    total_score = compute_mirror_score(domain_scores)
    gap_skills = compute_gap_skills(
        skill_level_map, skill_demand, aspiration_skills, skill_to_cluster,
    )
    # Honest "what moves score most" — attach the real projected total-score gain
    # from practising each gap one proficiency level (the actionable next step).
    # Pure what-if re-run of the engine, never a fabricated number (T2-3).
    for gap in gap_skills:
        next_level = min(gap["current_level"] + 1, 5)
        projected = project_total_with_skill_bump(
            skill_level_map, gap["taxonomy_key"], next_level,
            cluster_children, skill_to_cluster, cluster_to_domain,
        )
        gap["score_delta"] = round(max(0.0, projected - total_score), 1)
        # Domain the gap belongs to — lets the personal score breakdown render
        # each lever inline under its domain row (T2-3 Part A).
        gap["domain"] = cluster_to_domain.get(gap.get("taxonomy_l2_cluster", ""), "General")
    rank_tier = compute_rank_tier(total_score)
    skills_assessed = (
        skills_assessed_override if skills_assessed_override is not None else len(skill_level_map)
    )
    return ScoreProjection(
        total_score=total_score,
        domain_scores=domain_scores,
        gap_skills=gap_skills,
        rank_tier=rank_tier,
        skills_assessed=skills_assessed,
    )


def _persist_score(
    scores_repo: ScoresRepository,
    user_id: str,
    projection: ScoreProjection,
) -> dict:
    payload = {
        "total_score":     projection.total_score,
        "domain_scores":   projection.domain_scores,
        "skill_scores":    {},
        "gap_skills":      projection.gap_skills,
        "rank_tier":       projection.rank_tier,
        "skills_assessed": projection.skills_assessed,
    }
    if scores_repo.mirror_score_exists(user_id):
        scores_repo.update_mirror_score(user_id, payload)
    else:
        scores_repo.insert_mirror_score(user_id, payload)
    scores_repo.append_score_history(user_id, projection.total_score)
    return scores_repo.require_mirror_score(user_id)


def _build_user_skill_rows(
    scores_repo: ScoresRepository,
    user_id: str,
    skill_level_map: dict[str, int],
    signals: list[dict],
) -> list[dict]:
    from app.services.taxonomy_loader import ensure_skill_in_db

    evidence_map: dict[str, str] = {s["taxonomy_key"]: s["evidence"] for s in signals}
    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    for key, level in skill_level_map.items():
        skill_id = ensure_skill_in_db(scores_repo.client, key)
        if skill_id is None:
            continue
        rows.append({
            "user_id":           user_id,
            "skill_id":          skill_id,
            "matched_level":     level,
            "proficiency_title": _PROFICIENCY_TITLES.get(level, "Scout"),
            "source":            "cv",
            "evidence_text":     evidence_map.get(key, ""),
            "last_updated":      now,
        })
    return rows
