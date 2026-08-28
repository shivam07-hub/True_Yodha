"""
services/matching/ranking.py — the JobRanking facade.

ONE entry point for "given a candidate pool + a targeting profile, produce ranked
jobs (deterministic overlap, optionally brain-scored)". It DELEGATES to the two
tuned stages — it never reimplements them:

  - Stage 1 (deterministic): ``job_matcher.get_top_matches`` — skill overlap +
    role boost + company cap.
  - Stage 2 (brain): ``llm_ranker.evaluate_all`` — the Career-Ops 5-axis eval +
    grade + Apply/Negotiate/Skip verdict + legitimacy tier + archetype
    (Consolidation A).

Callers:
  - ``jobs_workflow.compute_job_matches`` (the batch compute — CV upload, paid
    Refresh, or scrape-triggered sweep) routes through ``rank()`` —
    behaviour-identical to the old inline get_top_matches + rank_and_persist duo.
  - Consolidation D (a job opened/saved anywhere) routes through ``rank_one()`` for
    a single on-demand brain eval, then caches it into ``user_job_matches``.

This module writes nothing — persistence stays in ``llm_ranker.persist_matches``.
See CONTEXT.md "JobRanking".
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.services import job_matcher, llm_ranker
from app.services.llm_provider import LLMProvider
from app.services.llm_ranker import RankProgressCb

# Called once with the triaged shortlist, before per-job reasoning. See `rank`.
ShortlistCb = Callable[[list[dict[str, Any]]], None]

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrackSpec:
    """One of a user's job searches, as the ranker needs it.

    `track_id is None` is track 1 — the profile. See
    `app/services/job_tracks.py`; a track is the user's own role words, never a
    taxonomy key, because the triage brain separates them by reading titles and
    JDs and `role_family` demonstrably cannot.
    """

    track_id: int | None
    label: str
    role_titles: tuple[str, ...]
    #: How many of the pool this track keeps out of triage — the user-facing
    #: "15-20 marketing". A ceiling on real listings, never a target to pad to
    #: with anything that is not in the pool.
    quota: int
    #: How many of that quota reach the expensive per-job eval. The rest ship as
    #: real rows with overlap scores and no verdict — a Provisional Match, which
    #: the read seam already renders as `verdict == "checking"` and upgrades in
    #: place. This is what keeps two tracks near one track's latency.
    deep: int


@dataclass(frozen=True)
class RankCandidates:
    """Raw inputs to the deterministic overlap stage (Stage 1).

    Bundles what ``job_matcher.get_top_matches`` needs so ``rank`` keeps the locked
    ``rank(profile, cv, jobs, ...)`` shape without a long positional tail.
    """

    job_skill_rows: list[dict[str, Any]]
    user_skill_map: dict[str, int]
    job_meta_fetcher: Callable[[list[str]], list[dict[str, Any]]]
    top_n: int = 12
    # Two-tier brain (career-ops shape): when set, ``top_n`` is the deterministic
    # POOL depth and ``triage_keep`` is how many of that pool survive the cheap
    # batched brain-triage into the expensive per-job 5-axis eval. None → no triage
    # (eval every one of the ``top_n`` shortlist, the pre-triage behaviour).
    triage_keep: int | None = None
    # Backlog #36 (brain-everywhere, cost control): looks up already-cached evals
    # for a batch of job_ids (typically JobsRepository.get_cached_match_evals).
    # Optional — omit for the old always-eval behaviour (on-demand rank_one path
    # doesn't need it, it has its own cache check one level up).
    eval_cache_fetcher: Callable[[list[str]], dict[str, dict[str, Any]]] | None = None
    # Standardized matcher (CandidatePool seam): given the overlap-ranked pool, returns
    # the FINAL triage pool — overlap ∪ career-ops title_filter (∪ semantic, later). The
    # brain triage then selects over the union, so a role-right, overlap-poor job reaches
    # it. None → overlap-only pool (rank stays DB-agnostic; the caller owns the union).
    pool_augmenter: Callable[[list[dict[str, Any]]], list[dict[str, Any]]] | None = None
    # Per-track triage. Empty (the default) is exactly today's behaviour, and a
    # single-track user MUST take that path — 83% of users have one search and
    # their run may not change shape because a minority feature exists.
    tracks: tuple[TrackSpec, ...] = ()


@dataclass(frozen=True)
class RankResult:
    """Deterministic shortlist + optional brain evals keyed by job_id.

    ``evaluations`` is empty when the brain is skipped (``use_brain=False`` /
    ``provider is None``) or every eval failed — the deterministic scores still
    stand on their own, exactly as the old ``persist_matches`` fallback assumed.
    """

    top_jobs: list[dict[str, Any]] = field(default_factory=list)
    evaluations: dict[str, dict[str, Any]] = field(default_factory=dict)



async def _triage_by_track(
    eval_profile: dict[str, Any],
    pool: list[dict[str, Any]],
    provider: LLMProvider,
    tracks: tuple[TrackSpec, ...],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Triage the SAME pool once per track. Returns (all kept, the deep subset).

    One pool, because the pool is scoped by location and seniority — facts about
    the person, identical across their searches. What differs is the role words,
    so each track triages with its own, and the brain reads titles and JDs to
    decide which search a job belongs to.

    **A job lands in exactly one track.** `user_job_matches` is keyed
    (user_id, job_id) so that every job is brain-evaluated once, ever — the
    property that makes rating this much affordable. A job kept by two tracks
    would need two rows, and would pay the brain twice for the one row that can
    exist. The earlier track wins, and the later track fills its quota from the
    rest of the pool instead. That also keeps the count honest: "20 marketing"
    means twenty jobs, not twenty minus the ones already shown above.
    """
    kept: list[dict[str, Any]] = []
    deep: list[dict[str, Any]] = []
    claimed: set[str] = set()

    for track in tracks:
        available = [job for job in pool if str(job["job_id"]) not in claimed]
        if not available:
            continue
        track_profile = {**eval_profile, "target_roles": list(track.role_titles)}
        shortlist = await llm_ranker.triage_shortlist(
            track_profile, available, provider, track.quota
        )
        mine: list[dict[str, Any]] = []
        for job in shortlist:
            job_id = str(job["job_id"])
            # `available` already excluded claimed jobs, but the triage is a
            # model call and may echo one back. Belt: the claim is what makes
            # "one job, one track" true, so it is checked where it is used.
            if job_id in claimed:
                continue
            claimed.add(job_id)
            job["track_id"] = track.track_id
            mine.append(job)
        kept.extend(mine)
        # The deep subset is this track's OWN top rows, not the head of a
        # shortlist that may open with jobs another track already took.
        deep.extend(mine[: max(0, track.deep)])

    return kept, deep

async def rank(
    profile: dict[str, Any],
    cv_markdown: str,
    jobs: RankCandidates,
    *,
    provider: LLMProvider | None = None,
    use_brain: bool = True,
    budget: int | None = None,
    on_progress: RankProgressCb | None = None,
    on_shortlist: ShortlistCb | None = None,
    debug: dict[str, int] | None = None,
) -> RankResult:
    """Deterministic overlap → (optional) brain. Pure compute, no DB writes.

    ``on_shortlist`` is called ONCE with the triaged shortlist, before the
    expensive per-job reasoning starts. It exists so a caller that persists can
    make those jobs visible while the slow half runs — the per-job eval is the
    166-220s a user watches; triage is one cheap batched call.

    Fired AFTER triage, not after the deterministic pool, deliberately: the raw
    overlap head contains jobs the brain would reject outright (a banker role for
    a backend engineer scores overlap on "Communication"), and surfacing those as
    a first shortlist would spend the top slot on something we already know how to
    reject. Triage is the cheap gate that removes them. This module still writes
    nothing — the callback belongs to whoever owns the write.

    ``use_brain=False`` or ``provider is None`` → deterministic-only (overlap
    scores, no evals). ``budget`` caps how many of the shortlist reach the brain
    (cost control for on-demand callers); ``None`` = brain every shortlisted job.

    Backlog #36 (brain-everywhere, cost control): when ``jobs.eval_cache_fetcher``
    is given, a job already evaluated for this user (any prior run — permanent
    per-(user,job) identity, migration 20260710) is NEVER re-sent to the LLM; its
    cached row is reused verbatim. Only genuinely new/uncached jobs reach
    ``evaluate_all``. This is what makes rating "as much as possible" affordable —
    every job is brain-evaluated once, ever, not once per compute call.
    """
    top_jobs = job_matcher.get_top_matches(
        jobs.job_skill_rows,
        jobs.user_skill_map,
        job_meta_fetcher=jobs.job_meta_fetcher,
        target_roles=profile.get("target_roles") or [],
        top_n=jobs.top_n,
        debug=debug,
    )
    # CandidatePool: union the career-ops title_filter selector onto the overlap pool
    # BEFORE triage, so a role-right job the taxonomy missed still reaches the brain.
    if jobs.pool_augmenter is not None:
        top_jobs = jobs.pool_augmenter(top_jobs)
    if not top_jobs or not use_brain or provider is None:
        return RankResult(top_jobs=top_jobs, evaluations={})

    eval_profile = _eval_profile(profile, cv_markdown)

    # Tier-1 triage: brain picks the best-fit shortlist out of the deterministic
    # pool BEFORE the expensive per-job reasoning. One cheap batched call; the
    # persisted matches become the triaged shortlist, not the raw overlap head.
    deep_jobs: list[dict[str, Any]] | None = None
    if jobs.tracks:
        pool_size = len(top_jobs)
        top_jobs, deep_jobs = await _triage_by_track(
            eval_profile, top_jobs, provider, jobs.tracks
        )
        if debug is not None:
            debug["triage_pool"] = pool_size
            debug["triage_kept"] = len(top_jobs)
            debug["triage_tracks"] = len(jobs.tracks)
            debug["triage_deep"] = len(deep_jobs)
    elif jobs.triage_keep is not None and len(top_jobs) > jobs.triage_keep:
        pool_size = len(top_jobs)
        top_jobs = await llm_ranker.triage_shortlist(
            eval_profile, top_jobs, provider, jobs.triage_keep
        )
        if debug is not None:
            debug["triage_pool"] = pool_size
            debug["triage_kept"] = len(top_jobs)

    # The shortlist is decided. Everything after this is the slow half.
    if on_shortlist is not None:
        on_shortlist(top_jobs)

    if deep_jobs is not None:
        brain_jobs = deep_jobs
    else:
        brain_jobs = top_jobs if budget is None else top_jobs[: max(0, budget)]

    cached_evals: dict[str, dict[str, Any]] = {}
    if jobs.eval_cache_fetcher is not None:
        job_ids = [str(j["job_id"]) for j in brain_jobs]
        cached_evals = jobs.eval_cache_fetcher(job_ids)
    # A cached row must carry a real verdict (overall_score) to count as "already
    # evaluated" — a stale overlap-only row (brain never ran) still needs rating.
    cached_evals = {k: v for k, v in cached_evals.items() if v.get("overall_score") is not None}
    uncached_jobs = [j for j in brain_jobs if str(j["job_id"]) not in cached_evals]
    if debug is not None:
        debug["brain_cache_hits"] = len(cached_evals)
        debug["brain_cache_misses"] = len(uncached_jobs)

    new_evaluations = (
        await llm_ranker.evaluate_all(eval_profile, uncached_jobs, provider, on_progress)
        if uncached_jobs
        else {}
    )
    evaluations = {**cached_evals, **new_evaluations}
    if not evaluations and brain_jobs:
        logger.warning("JobRanking: all brain evals failed — deterministic scores only")
    return RankResult(top_jobs=top_jobs, evaluations=evaluations)


async def rank_one(
    profile: dict[str, Any],
    cv_markdown: str,
    job: dict[str, Any],
    provider: LLMProvider,
) -> dict[str, Any] | None:
    """On-demand single-job brain (Consolidation D: a job opened/saved anywhere).

    ``job`` is a ``get_top_matches``-shaped dict (title/company/industry/location/
    description/matched_skills/overlap_score). Returns a ``parse_eval()`` dict or
    ``None`` on provider/parse failure. NOT a per-request bulk path — callers cache
    the result into ``user_job_matches`` so the brain runs once per job, not once
    per view.
    """
    eval_profile = _eval_profile(profile, cv_markdown)
    system_prompt = llm_ranker.build_system_prompt(eval_profile, eval_profile["cv_markdown"])
    return await llm_ranker.evaluate_job(job, system_prompt, provider)


def _eval_profile(profile: dict[str, Any], cv_markdown: str) -> dict[str, Any]:
    """Ensure the brain prompt sees a CV — the facade's explicit ``cv`` wins, else
    fall back to whatever the profile already carried (behaviour-identical to the
    old path, where ``evaluate_all`` read ``profile['cv_markdown']``)."""
    return {**profile, "cv_markdown": cv_markdown or profile.get("cv_markdown") or ""}
