"""
persistence.py
Supabase I/O for the scoring pipeline + the orchestrator entry point.

Reads:   public.jobs (skill demand + aspiration targets)
Writes:  public.user_skills, public.mirror_scores, public.mirror_score_history
"""

import logging
from datetime import datetime, timezone

from app.repositories.scores import ScoresRepository
from app.services.scoring.formulas import (
    _PROFICIENCY_TITLES,
    _build_cluster_maps,
    build_skill_level_map,
    compute_cluster_scores,
    compute_domain_scores,
    compute_mirror_score,
)
from app.services.scoring.gap import compute_gap_skills, compute_rank_tier

logger = logging.getLogger(__name__)


# ── Supabase reads ────────────────────────────────────────────────────────────

def fetch_aspiration_skills(scores_repo: ScoresRepository, target_roles: list[str]) -> dict[str, int]:
    """
    Builds {skill_name: target_proficiency} from jobs matching any of the target roles.

    Proficiency targets derived from skill frequency across matching jobs:
      - main_skill appearing in >50% of role jobs → target L4
      - main_skill appearing in >25%              → target L3
      - side_skill (any frequency)                → target L2

    Returns empty dict if no matching jobs found (caller falls back to market demand).
    """
    if not target_roles:
        return {}

    all_rows: list[dict] = []
    for role in target_roles:
        try:
            page1 = scores_repo.find_role_skill_rows(role)
        except Exception as exc:
            logger.warning("Aspiration skill lookup failed for role %r: %s", role, exc)
            continue
        all_rows.extend(page1 or [])

    if not all_rows:
        return {}

    total = len(all_rows)
    main_counts: dict[str, int] = {}
    side_set:    set[str]       = set()

    for row in all_rows:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                main_counts[s.strip()] = main_counts.get(s.strip(), 0) + 1
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                side_set.add(s.strip())

    aspiration: dict[str, int] = {}
    for skill, count in main_counts.items():
        freq = count / total
        aspiration[skill] = 4 if freq > 0.5 else 3
    for skill in side_set:
        if skill not in aspiration:
            aspiration[skill] = 2

    return aspiration


def fetch_skill_demand(scores_repo: ScoresRepository) -> dict[str, int]:
    """
    Returns {skill_name: job_count} by counting occurrences across
    jobs.main_skills and jobs.side_skills. Source of truth: public.jobs table.
    main_skills weighted ×2 to reflect must-have vs nice-to-have distinction.
    """
    try:
        rows = scores_repo.list_market_skill_rows()
    except Exception as exc:
        logger.warning("Market skill demand lookup failed: %s", exc)
        return {}
    counts: dict[str, int] = {}
    for row in rows:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 2
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 1
    return counts


# ── Supabase writes ───────────────────────────────────────────────────────────

def persist_user_skills(
    scores_repo: ScoresRepository,
    user_id: str,
    skill_level_map: dict[str, int],
    signals: list[dict],
) -> int:
    """Upsert one row per detected skill into user_skills. Returns count written."""
    from app.services.taxonomy_loader import ensure_skill_in_db
    evidence_map: dict[str, str] = {}
    for s in signals:
        evidence_map.setdefault(s["taxonomy_key"], s["evidence"])

    rows = []
    for key, level in skill_level_map.items():
        skill_id = ensure_skill_in_db(scores_repo.client, key)
        if skill_id is None:
            continue
        rows.append({
            "user_id":         user_id,
            "skill_id":        skill_id,
            "matched_level":   level,
            "proficiency_title": _PROFICIENCY_TITLES.get(level, "Scout"),
            "source":          "cv",
            "evidence_text":   evidence_map.get(key, ""),
            "last_updated":    datetime.now(timezone.utc).isoformat(),
        })

    scores_repo.upsert_user_skill_rows(rows)
    return len(rows)


def persist_score(
    scores_repo: ScoresRepository,
    user_id: str,
    total_score: float,
    domain_scores: dict[str, float],
    gap_skills: list[dict],
    skills_assessed: int,
    rank_tier: str,
) -> dict:
    """Write to mirror_scores (upsert) and append to mirror_score_history."""
    payload = {
        "total_score":     total_score,
        "domain_scores":   domain_scores,
        "skill_scores":    {},
        "gap_skills":      gap_skills,
        "rank_tier":       rank_tier,
        "skills_assessed": skills_assessed,
    }
    if scores_repo.mirror_score_exists(user_id):
        scores_repo.update_mirror_score(user_id, payload)
    else:
        scores_repo.insert_mirror_score(user_id, payload)

    scores_repo.append_score_history(user_id, total_score)

    return scores_repo.require_mirror_score(user_id)


# ── Orchestrator ──────────────────────────────────────────────────────────────

def compute_and_persist_score(
    scores_repo: ScoresRepository,
    user_id: str,
    skills_detected: list[dict] | None = None,
    aspiration_skills: dict[str, int] | None = None,
    skill_level_map: dict[str, int] | None = None,
    include_market_signals: bool = True,
    require_skills_assessed: bool = False,
) -> dict:
    """
    Full scoring pipeline. Two calling modes:
      - CV upload: pass skills_detected (raw signals). Infers levels, writes user_skills.
      - Recompute: pass skill_level_map (stored matched_level values). Skips signal
        inference and does NOT overwrite user_skills — preserves original proficiency
        levels and evidence text.

    Set require_skills_assessed=True for CV ingestion paths that must reject
    payloads when zero skills can be persisted to user_skills.
    """
    if skill_level_map is None:
        skill_level_map = build_skill_level_map(skills_detected or [])

    cluster_children, skill_to_cluster, cluster_to_domain = _build_cluster_maps()
    skill_demand = fetch_skill_demand(scores_repo) if include_market_signals else {}

    cluster_scores = compute_cluster_scores(skill_level_map, cluster_children, skill_to_cluster)
    cluster_skill_counts = {
        cluster: sum(1 for s in skill_level_map if skill_to_cluster.get(s) == cluster)
        for cluster in cluster_scores
    }
    domain_scores = compute_domain_scores(cluster_scores, cluster_to_domain, cluster_skill_counts)
    total_score = compute_mirror_score(domain_scores)

    gap_skills = compute_gap_skills(
        skill_level_map, skill_demand,
        aspiration_skills or {},
        skill_to_cluster,
    )
    rank_tier = compute_rank_tier(total_score)

    if skills_detected is not None:
        skills_count = persist_user_skills(scores_repo, user_id, skill_level_map, skills_detected)
        if require_skills_assessed and skills_count == 0:
            raise ValueError("No valid skills could be persisted for this user.")
    else:
        skills_count = len(skill_level_map)

    return persist_score(
        scores_repo, user_id, total_score, domain_scores, gap_skills, skills_count, rank_tier
    )
