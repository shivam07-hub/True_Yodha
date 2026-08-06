"""The one writer of ``job_skills``, and the one queue that feeds it.

The invariant this enforces is the whole reason the module exists:

    No code path may create a job without skills.

Every caller that puts skills on a job goes through :func:`write_skill_floor` —
the extension import path and the queue drain today, ingest and Stage B next.
One writer means one answer to "what skills does this job need", and one place
to change when that answer's shape changes.

The matching rule on the read side: work is claimed from ``jobs.enrichment_status``,
the same state machine the scraper's enrichment workers use. Stage A and Stage B
are two READERS of one queue, which is fine; two definitions of the work set is
not, and briefly having both is what this module was corrected for.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client

from app.services.skill_extraction import ExtractedSkill, extract_skills, merge_zones

logger = logging.getLogger(__name__)

# Taxonomy keys are ~40 chars; 100 keeps the PostgREST `.in_()` URL bounded.
# An `.in_()` that grows with the data 400s with an opaque `Bad Request`.
_SKILL_KEY_CHUNK = 100
_FLOOR_PAGE_SIZE = 100  # job_ids are short; 100 keeps the by-id `.in_()` URL small


def resolve_skill_ids(db: Client, taxonomy_keys: list[str]) -> dict[str, int]:
    """``taxonomy_key`` → ``skills.id`` for the keys the taxonomy table knows.

    Unresolved keys are dropped rather than inserted: ``job_skills.skill_id`` is
    a foreign key, so a key with no row is not a partial write, it is a failed
    one that takes the whole batch with it.
    """
    resolved: dict[str, int] = {}
    unique = list(dict.fromkeys(key for key in taxonomy_keys if key))
    for i in range(0, len(unique), _SKILL_KEY_CHUNK):
        chunk = unique[i:i + _SKILL_KEY_CHUNK]
        rows = (
            db.table("skills").select("id, taxonomy_key").in_("taxonomy_key", chunk).execute()
        ).data or []
        for row in rows:
            key, skill_id = row.get("taxonomy_key"), row.get("id")
            if key and skill_id is not None:
                resolved[str(key)] = int(skill_id)
    return resolved


STAGE_A = "stage_a"
USER_CONFIRMED = "user_confirmed"


def write_skill_floor(
    db: Client,
    job_id: str,
    skills: list[ExtractedSkill],
    *,
    evidence_source: str = STAGE_A,
) -> int:
    """Persist a job's skills. Returns rows written. Never deletes.

    Upsert, not replace: a caller with a thin result must never be able to
    remove a richer set someone else wrote. That is precisely how
    ``apply_job_enrichment`` destroyed skills before 20260806b — it deleted
    first and inserted an empty set second.

    ``evidence_source`` is not decoration. A deterministic floor row and a
    judgment-model row are otherwise identical, which would leave us unable to
    tell Stage B what to re-do, unable to mark a match provisional to the user,
    and unable to ever measure this extractor against the model that supersedes
    it.
    """
    merged = merge_zones(skills)
    if not merged:
        return 0
    skill_ids = resolve_skill_ids(db, [skill.taxonomy_key for skill in merged])
    payload = [
        {
            "job_id": job_id,
            "skill_id": skill_ids[skill.taxonomy_key],
            "is_primary": skill.is_must_have,
            "required_level": skill.required_level,
            "evidence_source": evidence_source,
        }
        for skill in merged
        if skill.taxonomy_key in skill_ids
    ]
    if not payload:
        return 0
    db.table("job_skills").upsert(payload, on_conflict="job_id,skill_id").execute()
    return len(payload)


def count_missing_floor(db: Client) -> tuple[int, int]:
    """(jobs with no skills, of which recommendable).

    Reads the trigger-maintained `jobs.has_skill_floor` through a partial index
    — ~2ms. It used to be a live anti-join over 62k jobs x 376k skill rows,
    which exceeded Supabase's SERVER-side statement_timeout and returned 57014
    no matter what the client timeout was. A monitor that throws every six hours
    is not a monitor.
    """
    rows = db.rpc("count_jobs_missing_skill_floor", {}).execute().data or []
    row = rows[0] if isinstance(rows, list) and rows else (rows if isinstance(rows, dict) else {})
    return int(row.get("total") or 0), int(row.get("recommendable") or 0)


def claim_jobs_for_floor(db: Client, *, limit: int = _FLOOR_PAGE_SIZE) -> list[dict[str, Any]]:
    """Atomically claim the next jobs needing a floor.

    ONE definition of the work set — ``jobs.has_skill_floor``, maintained by the
    same trigger that maintains ``role_family`` — read with FOR UPDATE SKIP
    LOCKED so a row is served to exactly one worker. The claim stamps Stage A's
    OWN column and nothing else: ``enrichment_status`` belongs to the enrichment
    pipeline, and a pre-processor borrowing it is two owners of one column.

    It deliberately does not derive work from an anti-join over job_skills.
    That was a second, disagreeing answer to the same question, and it fought
    the transport besides — PostgREST truncates every response at 1,000 rows
    without erroring, so a partial work list looked exactly like a finished one.
    """
    return list(db.rpc("claim_jobs_for_skill_floor", {"p_limit": limit}).execute().data or [])


def apply_floor_to_job(db: Client, job: dict[str, Any]) -> int:
    """Extract and persist the floor for one job. Returns rows written."""
    return write_skill_floor(
        db,
        str(job["job_id"]),
        extract_skills(str(job.get("job_title") or ""), str(job.get("job_description") or "")),
    )


def drain_skill_floor_queue(db: Client, *, limit: int | None = None) -> dict[str, int]:
    """Floor every queued job. Returns counts so a caller can assert movement.

    A job whose text yields nothing is counted separately — that is a real
    answer about the posting, not a failure to hide.
    """
    seen = written = empty = 0
    while True:
        batch = claim_jobs_for_floor(db)
        if not batch:
            return {"jobs_seen": seen, "jobs_written": written, "jobs_empty": empty}
        for job in batch:
            seen += 1
            if apply_floor_to_job(db, job):
                written += 1
            else:
                # Stage A found nothing. That is Stage A's answer, not the
                # corpus's: these are short summary blurbs naming no skill
                # literally, and a judgment model reading prose may still find
                # one. The claim already recorded the attempt, so the job stays
                # in Stage B's queue untouched.
                empty += 1
        logger.info("metric skill_floor.drain_progress seen=%d written=%d empty=%d", seen, written, empty)
        if limit is not None and seen >= limit:
            logger.info("metric skill_floor.drain_stopped_at_limit limit=%d", limit)
            return {"jobs_seen": seen, "jobs_written": written, "jobs_empty": empty}
