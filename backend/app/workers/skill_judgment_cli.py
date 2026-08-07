"""Stage B — upgrade deterministic skill floors with judgment.

    python -m app.workers.skill_judgment_cli --count
    python -m app.workers.skill_judgment_cli --apply [--limit N] [--batch 25]

Reads jobs standing on a Stage A floor, asks the model to mark those exact
candidates, and rewrites the rows it ruled on. Safe to re-run and safe to stop:
the floor is already persisted, so a job that is never judged stays matchable.

Every job's elapsed time and token budget is logged. That is deliberate — the
1-2 min/job figure this slice exists to fix has never been attributed. Two
candidate causes are visible in the scraper's code and cannot be told apart
without a live run: a reasoning model spending up to 2,048 thinking tokens to
emit ~120 (`_max_tokens = 2048 if _MODEL_SPEED == "quality"`), or a small model
under a flat 512-token ceiling. `metric skill_judgment.job` answers it with data
instead of another theory.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from time import perf_counter

from app.database import get_supabase_admin_batch
from app.services import skill_floor, skill_judgment
from app.services.skill_extraction import extract_skills

logger = logging.getLogger("skill_judgment")

_LOCAL_ENDPOINT = os.getenv("LOCAL_INFERENCE_BASE_URL", "http://localhost:1234/v1")

JUDGMENT_SOURCE = "enrichment"


def _count(db) -> tuple[int, int]:
    rows = db.rpc("count_jobs_awaiting_judgment", {}).execute().data or []
    row = rows[0] if isinstance(rows, list) and rows else (rows if isinstance(rows, dict) else {})
    return int(row.get("total") or 0), int(row.get("recommendable") or 0)


async def _judge_one(db, job: dict, *, local: bool = False) -> tuple[str, float, int]:
    """Judge one job. Returns (outcome, elapsed_seconds, candidates_offered).

    outcome is "upgraded" | "ruled_empty" | "no_candidates" | "unreachable".
    Only "unreachable" releases the claim — the others are answers about the
    job, and an answer spends the attempt.
    """
    title = str(job.get("job_title") or "")
    description = str(job.get("job_description") or "")
    candidates = extract_skills(title, description)[: skill_judgment.MAX_CANDIDATES]
    if not candidates:
        return "no_candidates", 0.0, 0

    started = perf_counter()
    verdicts = await skill_judgment.judge_skills(title, description, candidates, local=local)
    elapsed = perf_counter() - started

    if verdicts is None:
        logger.warning(
            "metric skill_judgment.job job_id=%s offered=%d outcome=unreachable seconds=%.1f",
            job.get("job_id"), len(candidates), elapsed,
        )
        return "unreachable", elapsed, len(candidates)

    rows = skill_judgment.to_skill_rows(verdicts)
    if not rows:
        # No verdict survived. The floor stands untouched — a failed judgment
        # must never leave a job worse off than deterministic extraction did.
        logger.info(
            "metric skill_judgment.job job_id=%s offered=%d outcome=ruled_empty seconds=%.1f budget=%d",
            job.get("job_id"), len(candidates), elapsed,
            skill_judgment.budget_tokens(len(candidates)),
        )
        return "ruled_empty", elapsed, len(candidates)

    skill_floor.write_skill_floor(
        db, str(job["job_id"]), rows, evidence_source=JUDGMENT_SOURCE
    )
    logger.info(
        "metric skill_judgment.job job_id=%s offered=%d ruled=%d kept=%d seconds=%.1f budget=%d",
        job.get("job_id"), len(candidates), len(verdicts), len(rows), elapsed,
        skill_judgment.budget_tokens(len(candidates)),
    )
    return "upgraded", elapsed, len(candidates)


async def _drain(db, *, limit: int | None, batch: int, local: bool) -> dict[str, float]:
    """Claim, judge, and hand back everything that did not get a verdict.

    A claim is a LEASE. Two ways to end a round holding jobs that were never
    judged, and both must release or the jobs are stranded as "judged" forever:
    the provider was unreachable, or `--limit` stopped the loop mid-batch. The
    latter is not hypothetical — the default batch is 25, so `--limit 20`
    strands five every single run, which is part of how the first live run
    stamped 50 jobs with zero verdicts.
    """
    seen = upgraded = unreachable = 0
    total_seconds = 0.0
    while True:
        claimed = (
            db.rpc("claim_jobs_for_skill_judgment", {"p_limit": batch}).execute().data or []
        )
        if not claimed:
            break

        unjudged: list[str] = []
        processed = 0
        for job in claimed:
            if limit is not None and seen >= limit:
                break
            seen += 1
            processed += 1
            outcome, elapsed, _ = await _judge_one(db, job, local=local)
            total_seconds += elapsed
            upgraded += int(outcome == "upgraded")
            if outcome == "unreachable":
                unreachable += 1
                unjudged.append(str(job["job_id"]))
        # Everything after `processed` was claimed and never looked at.
        unjudged.extend(str(job["job_id"]) for job in claimed[processed:])

        if unjudged:
            db.rpc("release_skill_judgment_claim", {"p_job_ids": unjudged}).execute()
            logger.info("metric skill_judgment.released count=%d", len(unjudged))

        logger.info(
            "metric skill_judgment.progress seen=%d upgraded=%d unreachable=%d mean_seconds=%.1f",
            seen, upgraded, unreachable, total_seconds / max(seen, 1),
        )
        # A whole batch failing to reach the model is an outage, not a run.
        # Grinding through 5,000 more jobs to fail identically helps nobody.
        if processed and unreachable == processed:
            logger.error(
                "metric skill_judgment.aborted reason=provider_unreachable seen=%d", seen
            )
            break
        if limit is not None and seen >= limit:
            break
    return {
        "jobs_seen": seen,
        "jobs_upgraded": upgraded,
        "jobs_unreachable": unreachable,
        "mean_seconds": total_seconds / max(seen, 1),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write judgments (default: count only)")
    parser.add_argument("--limit", type=int, default=None, help="stop after N jobs")
    parser.add_argument("--batch", type=int, default=25, help="jobs claimed per round")
    parser.add_argument(
        "--provider",
        choices=("auto", "local"),
        default="auto",
        help="auto = the standard fallback ladder; local = a single local "
             "OpenAI-compatible endpoint (LM Studio), no fallback",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    db = get_supabase_admin_batch()

    total, recommendable = _count(db)
    logger.info("metric skill_judgment.backlog total=%d recommendable=%d", total, recommendable)
    if not args.apply:
        return 0

    local = args.provider == "local"
    if local:
        from app.services.llm_provider import local_inference_ready

        ready, detail = asyncio.run(local_inference_ready())
        logger.info(
            "metric skill_judgment.provider mode=local endpoint=%s ready=%s detail=%s",
            _LOCAL_ENDPOINT, ready, detail,
        )
        if not ready:
            logger.error(
                "Local inference endpoint is not serving a model.\n"
                "  Start LM Studio, load a model, and enable the local server "
                "(Developer tab -> Start Server), then re-run.\n"
                "  Override the endpoint with LOCAL_INFERENCE_BASE_URL if it is "
                "not on %s.", _LOCAL_ENDPOINT,
            )
            return 1
    result = asyncio.run(_drain(db, limit=args.limit, batch=args.batch, local=local))
    after_total, after_recommendable = _count(db)
    logger.info(
        "metric skill_judgment.done seen=%d upgraded=%d unreachable=%d mean_seconds=%.1f "
        "remaining=%d remaining_recommendable=%d",
        result["jobs_seen"], result["jobs_upgraded"], result["jobs_unreachable"],
        result["mean_seconds"], after_total, after_recommendable,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
