"""Scoring facade — typed entry points into the canonical Mirror Score engine.

Three intents:
  - record_cv_score   CV ingest: write user_skills + score
  - recompute_score   user_skills state changed: rerun math + persist score
  - project_score     pure math, no writes (tests + future what-if previews)

All three converge on the same private math + persistence so the score
remains canonically derived (OQ4). See docs/adr/0002-scoring-facade-split.md.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.repositories.scores import ScoresRepository
from app.services.job_eligibility import target_seniority_for_profile
from app.services.scoring.aspirations import fetch_role_family_market
from app.services.scoring.percentile import percentile_rank
from app.services.scoring.formulas import (
    _PROFICIENCY_TITLES,
    DEFAULT_TARGET_LEVEL,
    _build_cluster_maps,
    best_evidence_by_key,
    build_skill_level_map,
    compute_cluster_scores,
    compute_domain_scores,
    compute_mirror_score,
    project_total_with_skill_bump,
    target_level_for_seniority,
)
from app.services.scoring.gap import compute_gap_skills, compute_rank_tier
from app.services.scoring.market import fetch_skill_demand

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScoreProjection:
    total_score: float
    domain_scores: dict[str, float]
    domain_skill_counts: dict[str, int]
    gap_skills: list[dict]
    rank_tier: str
    skills_assessed: int


# ── Facades ───────────────────────────────────────────────────────────────────


def _band_target_level(seniority: str | None) -> int:
    """Raw profile seniority → band-relative scoring denominator.

    Normalizes aliases + the 'any'/null default through the one canonical
    resolver, then maps the band to its target proficiency level.
    """
    band = target_seniority_for_profile({"target_seniority": seniority})
    return target_level_for_seniority(band)


def record_cv_score(
    scores_repo: ScoresRepository,
    user_id: str,
    skills_detected: list[dict],
) -> dict:
    """CV ingest path. Infers levels from raw signals, writes user_skills + score.

    Raises ValueError when zero skills can be persisted (caller maps to 422).
    Scored against the profile's seniority band (entry when unset — a fresher
    uploading at onboarding is not measured against L5).
    """
    skill_level_map = build_skill_level_map(skills_detected)
    skill_rows = _build_user_skill_rows(scores_repo, user_id, skill_level_map, skills_detected)
    if not skill_rows:
        raise ValueError("No valid skills could be persisted for this user.")

    seniority = scores_repo.get_target_seniority(user_id)
    projection = _score_math(
        scores_repo,
        skill_level_map,
        aspiration_skills={},
        include_market_signals=False,
        target_level=_band_target_level(seniority),
        skills_assessed_override=len(skill_rows),
    )
    _persist_score(scores_repo, user_id, projection)
    scores_repo.upsert_user_skill_rows(skill_rows)
    _persist_band_percentile(scores_repo, user_id, seniority, projection.total_score)
    return scores_repo.require_mirror_score(user_id)


def build_cv_skill_rows(
    scores_repo: ScoresRepository,
    user_id: str,
    skills_detected: list[dict],
) -> list[dict[str, Any]]:
    """Map reviewed extraction signals to canonical ``user_skills`` rows.

    This performs taxonomy resolution only. It does not write or score, which
    lets the baseline confirmation transaction remain the publication gate.
    """
    skill_level_map = build_skill_level_map(skills_detected)
    return _build_user_skill_rows(
        scores_repo,
        user_id,
        skill_level_map,
        skills_detected,
    )


def recompute_score(scores_repo: ScoresRepository, user_id: str) -> dict:
    """Recompute path. Reads user_skills + target_roles, writes mirror_scores only.

    Used by skill correction, manual recompute, diary submit, tracker outcome.
    """
    inputs = scores_repo.get_recompute_inputs(user_id)
    market = fetch_role_family_market(scores_repo, inputs.target_roles)
    projection = _score_math(
        scores_repo,
        inputs.skill_level_map,
        aspiration_skills=market.aspiration,
        scoped_demand=market.demand,
        include_market_signals=True,
        target_level=_band_target_level(inputs.target_seniority),
    )
    _persist_score(scores_repo, user_id, projection)
    _persist_band_percentile(scores_repo, user_id, inputs.target_seniority, projection.total_score)
    return scores_repo.require_mirror_score(user_id)


def project_score(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    aspiration_skills: dict[str, int] | None = None,
    include_market_signals: bool = True,
    target_seniority: str | None = None,
) -> ScoreProjection:
    """Pure math, no writes. Tests + future what-if UX + anon preview.

    ``target_seniority`` bands the score; None → entry (the anon pre-login
    scorer has no confirmed band).
    """
    return _score_math(
        scores_repo,
        skill_level_map,
        aspiration_skills=aspiration_skills or {},
        include_market_signals=include_market_signals,
        target_level=_band_target_level(target_seniority),
    )


# ── Private internals ─────────────────────────────────────────────────────────


def _score_math(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    *,
    aspiration_skills: dict[str, int],
    scoped_demand: dict[str, int] | None = None,
    include_market_signals: bool,
    target_level: int = DEFAULT_TARGET_LEVEL,
    skills_assessed_override: int | None = None,
) -> ScoreProjection:
    cluster_children, skill_to_cluster, cluster_to_domain = _build_cluster_maps()
    # Demand the user's own families already answered, from the same pass that set
    # the aspiration targets. Anything left is a skill the user holds that their
    # chosen market never mentions — priced against the open market instead, and a
    # short list by construction (their CV, not the family's 1,600-key vocabulary).
    skill_demand: dict[str, int] = dict(scoped_demand or {})
    if include_market_signals:
        residual = (set(skill_level_map) | set(aspiration_skills)) - set(skill_demand)
        if residual:
            skill_demand.update(fetch_skill_demand(scores_repo, residual))

    cluster_scores = compute_cluster_scores(
        skill_level_map, cluster_children, skill_to_cluster, target_level
    )
    cluster_skill_counts = {
        cluster: sum(1 for s in skill_level_map if skill_to_cluster.get(s) == cluster)
        for cluster in cluster_scores
    }
    domain_scores = compute_domain_scores(cluster_scores, cluster_to_domain, cluster_skill_counts)
    domain_skill_counts: dict[str, int] = {}
    for skill in skill_level_map:
        cluster = skill_to_cluster.get(skill)
        if cluster:
            domain = cluster_to_domain.get(cluster, "General")
            domain_skill_counts[domain] = domain_skill_counts.get(domain, 0) + 1
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
            cluster_children, skill_to_cluster, cluster_to_domain, target_level,
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
        domain_skill_counts=domain_skill_counts,
        gap_skills=gap_skills,
        rank_tier=rank_tier,
        skills_assessed=skills_assessed,
    )


def _persist_band_percentile(
    scores_repo: ScoresRepository,
    user_id: str,
    seniority: str | None,
    total_score: float,
) -> None:
    """Rank the user against same-band peers and persist mirror_scores.percentile.

    Best-effort: percentile is a confidence garnish, never a gate — a population
    read failure must not fail the score write. The band cutover script does the
    full-population pass; this keeps the subject's own cell fresh on every
    recompute at current scale.

    Only writes when the band has ≥2 peers. A caller with an RLS-scoped (token)
    client can only see its own row, so ranking against a population of one is
    meaningless — we skip and leave the last admin-computed value intact rather
    than clobber it with a bogus 0.
    """
    try:
        band = target_seniority_for_profile({"target_seniority": seniority})
        peers = [
            total
            for raw, total in scores_repo.get_all_band_scores()
            if target_seniority_for_profile({"target_seniority": raw}) == band
        ]
        if len(peers) < 2:
            return
        scores_repo.update_percentile(user_id, percentile_rank(total_score, peers))
    except Exception as exc:  # noqa: BLE001 — non-critical, log + move on
        logger.warning(
            "metric scoring.percentile_persist_failed user=%s exc=%s",
            user_id, exc.__class__.__name__,
        )


# Every column `_persist_score` writes. Declared here, beside the write, and
# asserted by `test_score_persist_contract` against the migrations — because the
# alternative is what happened on 2026-07-31: `domain_skill_counts` was added to
# the payload with no migration, PostgREST answered every write with
#
#   PGRST204: Could not find the 'domain_skill_counts' column of 'mirror_scores'
#
# and NOT ONE score was persisted for ANY user for three days. Nothing failed
# loudly: the job raised, RQ retried three times, exhausted, and the user sat on
# "Calculating your Myro Score" forever with the app reporting progress.
#
# Add a field to ScoreProjection → add it here → the test tells you the migration
# is missing, before prod does.
MIRROR_SCORE_COLUMNS = frozenset({
    "total_score",
    "domain_scores",
    "domain_skill_counts",
    "skill_scores",
    "gap_skills",
    "rank_tier",
    "skills_assessed",
})


def _persist_score(
    scores_repo: ScoresRepository,
    user_id: str,
    projection: ScoreProjection,
) -> dict:
    payload = {
        "total_score":     projection.total_score,
        "domain_scores":   projection.domain_scores,
        "domain_skill_counts": projection.domain_skill_counts,
        "skill_scores":    {},
        "gap_skills":      projection.gap_skills,
        "rank_tier":       projection.rank_tier,
        "skills_assessed": projection.skills_assessed,
    }
    assert set(payload) == MIRROR_SCORE_COLUMNS, (
        "mirror_scores payload drifted from its declared columns: "
        f"{set(payload) ^ MIRROR_SCORE_COLUMNS}"
    )
    try:
        if scores_repo.mirror_score_exists(user_id):
            scores_repo.update_mirror_score(user_id, payload)
        else:
            scores_repo.insert_mirror_score(user_id, payload)
    except Exception as exc:
        # The score write is the one step whose failure the user cannot see: the
        # result screen reads "no score row yet" as "still computing". Name it,
        # then re-raise so RQ retries and, on exhaustion, the job is FAILED rather
        # than reported OK.
        logger.error(
            "metric scoring.persist_failed user=%s exc=%s detail=%s",
            user_id, exc.__class__.__name__, exc,
        )
        raise
    scores_repo.append_score_history(user_id, projection.total_score)
    return scores_repo.require_mirror_score(user_id)


def _build_user_skill_rows(
    scores_repo: ScoresRepository,
    user_id: str,
    skill_level_map: dict[str, int],
    signals: list[dict],
) -> list[dict]:
    from app.services.taxonomy_loader import ensure_skill_in_db

    # Strongest receipt per skill, not whichever signal happened to be last in
    # the list — a bullet beats a skills-line mention as the reason we scored it.
    evidence_map = best_evidence_by_key(signals)
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
