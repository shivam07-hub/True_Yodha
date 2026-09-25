"""
services/matching/feed_warm.py — the /market aspiration drain.

The list a person sees is the career-ops judgment already stored on
`user_job_matches`. This worker opens the live jobs that match their
aspirations and have not been judged for the CV the run started with, a
batch at a time, and enqueues the next batch itself. It does not stop at a
silent cap. `direction_first` remains for callers that still ask which of a
given set to read first; the drain does not use it to decide membership.

This runs ONE batched brain pass (`llm_ranker.evaluate_all`) over the un-warmed
candidates. The HTTP route does not call it. `enqueue_feed_warm` puts
`feed_warm` on the fast Work Lane and returns; the Job Runner runs
`run_feed_warm` on `get_judgment_provider` — the judgment lane, NOT the free
interactive lane this line claimed until 2026-09-22, and not inside the
request the way `get_blocking_judgment_provider` was until 2026-09-25. It
matters which: this path writes 86% of all verdicts, so the model floor in
[[feedback_no_cheap_models_judgment]] either holds here or holds nowhere. It
reuses the exact shape + persist path as brain-on-open (`on_demand`) so a
warmed row and an opened row are identical downstream. Idempotent: a candidate
that already has a cached eval is skipped, so a re-warm inside the cache
window costs nothing.

Fail-soft: any failure leaves the feed showing the rows it already has, each
unread one marked `checking` — degradation, not an error, and not a list that
pretends retrieval order was a ranking.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services import background, llm_ranker, onboarding_service
from app.services.llm_provider import LLMProvider
from app.services.matching import direction_fit, on_demand, published_list, ranking, targeting

logger = logging.getLogger(__name__)

# One in-flight warm per user. The run measures ~100s; the window covers that
# so a client re-read does not enqueue a second one. It is not a request deadline.
_WARM_CLAIM_SECONDS = 180

# The shortlist depth — how many leading feed cards the brain ranks. Kept tight on
# purpose (CEO decision): a real "top picks" set, not the whole feed. Everything
# below stays fast deterministic overlap.
# Named for the warm, not for the list: `repositories.jobs.SHORTLIST_SIZE` is 40
# and means the length of the finite list. Two numbers shared one name until
# 2026-09-25, which is one grep away from a wrong constant.
WARM_SHORTLIST_SIZE = 10

# One worker tick. Not a membership cap: the pile is every aspiration-matched
# job that has not been judged for this CV, and a tick that leaves some
# enqueues the next tick itself.
DRAIN_BATCH = 8


def direction_first(
    rows: list[dict[str, Any]],
    vocabulary: frozenset[str],
    *,
    limit: int = WARM_SHORTLIST_SIZE,
) -> list[str]:
    """Choose which cards the brain rates: the work the user asked for, first.

    The warm writes 86% of all verdicts (982 of 1,141 measured 2026-09-11) and
    chose its ten by the feed's fit order, which is led by skill overlap with the
    CV — so 2% of them landed on the direction the user actually chose. Grading
    is free here: every feed row already carries `main_skills`, and the direction
    vocabulary is one indexed snapshot read.

    Within each group the feed's own order is kept — this decides WHICH cards get
    a verdict, never how the feed is ordered. An empty vocabulary grades
    everything unknown and returns the feed's order untouched, which is exactly
    the old behaviour.
    """
    graded = direction_fit.grade_all(rows, vocabulary)

    def _rank(pair: tuple[int, dict[str, Any]]) -> tuple[int, int]:
        position, row = pair
        fit = graded.get(str(row.get("job_id") or ""))
        return (0 if fit is not None and fit.is_on_direction else 1, position)

    ids: list[str] = []
    for _position, row in sorted(enumerate(rows), key=_rank):
        job_id = str(row.get("job_id") or "")
        if job_id and job_id not in ids:
            ids.append(job_id)
        if len(ids) >= limit:
            break
    return ids


def _user_skill_map(skill_rows: list[dict[str, Any]]) -> dict[str, int]:
    """taxonomy_key → matched_level for the user's CV skills (matcher input)."""
    return {
        row["skills"]["taxonomy_key"]: row["matched_level"]
        for row in skill_rows
        if row.get("skills")
    }


def _group_skill_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Bucket raw job_skills rows by job_id (fetch returns them ungrouped)."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        jid = str(row.get("job_id") or "")
        if jid:
            grouped.setdefault(jid, []).append(row)
    return grouped


async def warm_feed_shortlist(
    repo: Any,
    provider: LLMProvider,
    user_id: str,
    candidate_job_ids: list[str],
    *,
    limit: int = WARM_SHORTLIST_SIZE,
    profile: dict[str, Any] | None = None,
) -> int:
    """Brain-rank the top `limit` fit-sorted candidates that aren't cached yet.

    `candidate_job_ids` must arrive in the order the feed will show them (fit-sorted,
    top-of-page first) so the warmed set is exactly the cards the user sees first.
    Returns how many NEW evals were computed (0 if all cached or nothing to rank)."""
    ids = [str(j) for j in candidate_job_ids if j][:limit]
    if not ids:
        return 0
    from app.services.job_refresh._dispatch import user_has_live_refresh
    if user_has_live_refresh(user_id):
        logger.info("metric feed_warm.yielded user=%s stage=enter", user_id)
        return 0

    # The Targeting Brief, not the raw profile columns — same reason as on_demand:
    # these evals persist permanently per (user, job), so a memory-blind one here is
    # a memory-blind verdict forever.
    if profile is None:
        profile = targeting.for_ranking(repo, user_id).ranking_profile()
        if hasattr(repo, "get_latest_baseline_id"):
            profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)
    eval_ctx = onboarding_service.eval_context_key(profile)

    # Cached counts only if it was reasoned from what we believe NOW. A warm is
    # idempotent within a context and re-rates across one: the cost lands where the
    # targeting actually moved, not on every visit.
    cached = repo.get_cached_match_evals(user_id, ids)
    to_eval = [j for j in ids if not onboarding_service.eval_matches_context(cached.get(j), eval_ctx)]
    if not to_eval:
        return 0

    metas = {str(m["job_id"]): m for m in repo.get_jobs_by_ids(to_eval)}
    skill_rows_by_job = _group_skill_rows(repo.get_all_job_skill_rows(job_ids=to_eval))
    user_skill_map = _user_skill_map(repo.get_user_skill_rows(user_id))

    shaped: list[dict[str, Any]] = []
    for jid in to_eval:
        meta = metas.get(jid)
        if meta is None:
            continue
        shaped.append(
            on_demand._shape_single_job(meta, skill_rows_by_job.get(jid, []), user_skill_map)
        )
    if not shaped:
        return 0

    eval_profile = ranking._eval_profile(profile, profile.get("cv_markdown") or "")

    if user_has_live_refresh(user_id):
        logger.info("metric feed_warm.yielded user=%s stage=pre_eval", user_id)
        return 0

    evaluations = await llm_ranker.evaluate_all(eval_profile, shaped, provider)
    if not evaluations:
        logger.info("feed_warm: brain returned no evals for user=%s (%d candidates)", user_id, len(shaped))
        return 0

    shaped_by_id = {s["job_id"]: s for s in shaped}
    written = 0
    for jid, ev in evaluations.items():
        job = shaped_by_id.get(jid)
        if job is None or ev is None:
            continue
        on_demand._persist(repo, user_id, job, profile, ev)
        written += 1
    return written


def enqueue_feed_warm(user_id: str) -> bool:
    """Queue the shortlist warm. Returns whether one is in flight.

    False when a live match run owns the judgment lane — the caller paints
    the list as it is. True when this call queued the job, or an earlier
    call already holds the claim. Either way the request does not rank.
    """
    from app.services.job_refresh._dispatch import user_has_live_refresh

    if user_has_live_refresh(user_id):
        logger.info("metric feed_warm.yielded user=%s stage=enqueue", user_id)
        return False
    if not background.claim(f"feed_warm:{user_id}", _WARM_CLAIM_SECONDS):
        return True
    background.enqueue(
        background.LANE_FAST,
        "feed_warm",
        payload={"user_id": user_id},
    )
    return True


def _cached_evals(repo: Any, user_id: str, job_ids: list[str]) -> dict[str, Any]:
    """Badge reads in slices. One `in_` of a thousand ids blows the request URL."""
    found: dict[str, Any] = {}
    step = 100
    for start in range(0, len(job_ids), step):
        found.update(repo.get_cached_match_evals(user_id, job_ids[start : start + step]))
    return found


def _continue_drain(user_id: str, baseline_version_id: int | None) -> None:
    """Queue the next batch without taking the claim the first POST already holds."""
    background.enqueue(
        background.LANE_FAST,
        "feed_warm",
        payload={"user_id": user_id, "baseline_version_id": baseline_version_id},
    )


async def run_feed_warm(
    repo: Any,
    provider: LLMProvider,
    user_id: str,
    *,
    baseline_version_id: int | None = None,
) -> int:
    """Judge the next batch of aspiration-matched jobs on one CV.

    The CV is the baseline this run started with. A save during the run does
    not change it. When this baseline's pile is empty and a newer baseline
    exists, the next tick starts on that one.
    """
    profile = targeting.for_ranking(repo, user_id).ranking_profile()
    latest = (
        repo.get_latest_baseline_id(user_id)
        if hasattr(repo, "get_latest_baseline_id") else None
    )
    locked = baseline_version_id if baseline_version_id is not None else latest
    profile["baseline_version_id"] = locked
    if (
        locked is not None
        and locked != latest
        and hasattr(repo, "get_baseline_cv_markdown")
    ):
        text = repo.get_baseline_cv_markdown(user_id, locked)
        if text:
            profile["cv_markdown"] = text

    roles = [str(r) for r in (profile.get("target_roles") or []) if str(r).strip()]
    if not roles:
        return 0
    countries = profile.get("target_location_countries") or None
    ids = [
        str(job_id) for job_id in (
            repo.get_candidate_job_ids_for_roles(
                roles,
                target_location_countries=countries,
                limit=published_list.ASPIRATION_READ,
            ) or []
        ) if job_id
    ]
    eval_ctx = onboarding_service.eval_context_key(profile)
    cached = _cached_evals(repo, user_id, ids)
    pending = [
        job_id for job_id in ids
        if not onboarding_service.eval_matches_context(cached.get(job_id), eval_ctx)
    ]
    batch = pending[:DRAIN_BATCH]
    written = 0
    if batch:
        written = await warm_feed_shortlist(
            repo, provider, user_id, batch, limit=len(batch), profile=profile,
        )
        if written == 0:
            logger.warning(
                "metric feed_warm.batch_empty user=%s pending=%d",
                user_id, len(pending),
            )
            return 0
    if len(pending) > len(batch):
        _continue_drain(user_id, locked)
    elif latest is not None and locked != latest:
        _continue_drain(user_id, latest)
    return written


@background.handler("feed_warm")
async def _feed_warm_handler(payload: dict[str, Any], allow_retry: bool) -> None:  # noqa: ARG001
    """Fast lane: the user is on the list, waiting for the read rows to appear.

    Filing this under bulk is how a watched ranking waits behind work nobody
    is looking at. The handler is idempotent — a cached eval is skipped — so
    an RQ retry does not re-rate what already landed.
    """
    from app.database import get_supabase_admin
    from app.repositories.jobs import JobsRepository
    from app.services.llm_provider import get_judgment_provider

    user_id = str(payload["user_id"])
    raw_baseline = payload.get("baseline_version_id")
    baseline = int(raw_baseline) if raw_baseline is not None else None
    db = get_supabase_admin()
    repo = JobsRepository(db, db)
    await run_feed_warm(
        repo, get_judgment_provider(), user_id, baseline_version_id=baseline,
    )
