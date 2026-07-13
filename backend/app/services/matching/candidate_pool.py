"""CandidatePool — the seam that decides WHICH jobs reach the brain.

Unions the deterministic selectors so a role-right job reaches the strong-model triage
regardless of how it was found:

  * skill-overlap — ``get_candidate_job_ids_for_skills`` + ``get_top_matches`` scoring
  * title_filter  — ``get_candidate_job_ids_for_roles`` (career-ops role-title selector)

Semantic retrieval ([[project_semantic_job_retrieval]] Slice 2) unions in here later —
same seam, same merge. Overlap is a RANKING signal inside the pool, no longer the gate:
a title-matched job with zero skill overlap still enters (as a zero-overlap member) and
the strong-model triage does the real selection over the union. This is the "brain is
boss, overlap only cost-bounds" shape locked for the standardized matcher.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# A title-matched candidate reserves up to this share of the triage pool, so a large
# overlap set can never starve the role-right jobs the overlap selector missed — the
# whole reason the title selector exists.
TITLE_RESERVE_RATIO = 0.5


def _shape_title_only(meta: dict[str, Any]) -> dict[str, Any]:
    """A title-matched, overlap-poor job as a triage-pool member — the SAME shape a
    ``get_top_matches`` row has, so the brain treats it identically. overlap_score is
    0.0: this job was selected by its title, and the brain (not overlap) judges it."""
    return {
        "job_id": meta["job_id"],
        "title": meta.get("job_title") or "",
        "company": meta.get("company_name"),
        "location": meta.get("location"),
        "location_city": meta.get("location_city"),
        "location_country": meta.get("location_country"),
        "location_mode": meta.get("location_mode"),
        "industry": meta.get("industry"),
        "apply_url": meta.get("apply_url"),
        "description": (meta.get("job_description") or "")[:800],
        "overlap_score": 0.0,
        "matched_skills": [],
        "missing_skills": [],
    }


def merge_triage_pool(
    overlap_jobs: list[dict[str, Any]],
    title_only_metas: list[dict[str, Any]],
    *,
    pool_size: int,
) -> list[dict[str, Any]]:
    """Merge overlap-scored jobs with title-only candidates into one capped pool.

    Title-only candidates not already in the overlap set are guaranteed up to
    ``TITLE_RESERVE_RATIO`` of the pool, so a role-right, overlap-poor job always
    reaches the brain. Overlap jobs (the strongest deterministic signal) fill the rest.
    Dedupe is by job_id — a job selected by BOTH stays as its richer overlap row.
    """
    if pool_size <= 0:
        return []
    have = {j["job_id"] for j in overlap_jobs}
    extras = [
        _shape_title_only(m)
        for m in title_only_metas
        if m.get("job_id") and m["job_id"] not in have
    ]
    if not extras:
        return overlap_jobs[:pool_size]
    reserve = min(len(extras), int(pool_size * TITLE_RESERVE_RATIO))
    overlap_slots = max(0, pool_size - reserve)
    return overlap_jobs[:overlap_slots] + extras[:reserve]


def assemble(
    repo: Any,
    overlap_jobs: list[dict[str, Any]],
    *,
    role_titles: list[str],
    target_location_countries: list[str] | None,
    pool_size: int,
    exclude_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Union the caller's overlap-scored jobs with the title_filter selector.

    The caller keeps its own overlap path (get_candidate_job_ids_for_skills →
    get_top_matches, with any novelty exclusions already applied) and hands the ranked
    ``overlap_jobs`` in. This adds the career-ops title selector on top: jobs whose
    title matches the target roles but which the overlap selector never surfaced.
    ``exclude_ids`` (the caller's novelty-preference set) drops already-matched title
    jobs so they respect the same "prefer unseen" rule the overlap set does. Fails open
    — a title-selector error leaves the overlap pool intact (never breaks a run).
    """
    if not role_titles:
        return overlap_jobs[:pool_size]
    try:
        title_ids = repo.get_candidate_job_ids_for_roles(
            role_titles, target_location_countries=target_location_countries
        )
    except Exception as exc:  # noqa: BLE001 — the title selector must never break a run
        # Documented degradation: fall back to the overlap-only pool (still a valid
        # match set), and emit a metric so a persistently-failing title selector is
        # visible rather than silently narrowing everyone's matches.
        logger.warning("metric candidate_pool.title_selector_failed error=%s", exc)
        return overlap_jobs[:pool_size]
    have = {j["job_id"] for j in overlap_jobs}
    if exclude_ids:
        have = have | exclude_ids
    title_only_ids = [jid for jid in title_ids if jid not in have]
    title_metas = repo.get_jobs_by_ids(title_only_ids) if title_only_ids else []
    return merge_triage_pool(overlap_jobs, title_metas, pool_size=pool_size)
