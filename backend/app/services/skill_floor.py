"""The one writer of ``job_skills``, and the one queue that feeds it.

The invariant this enforces is the whole reason the module exists:

    No code path may create a job without skills.

Every caller that puts skills on a job goes through :func:`write_skill_floor` —
the extension import path and the queue drain today, ingest and Stage B next.
One writer means one answer to "what skills does this job need", and one place
to change when that answer's shape changes.

On the read side: the work SET has one definition (``jobs.has_skill_floor``,
trigger-maintained), the work LIFECYCLE has one owner (``enrichment_status``,
the enrichment pipeline's — Stage A never writes it), and Stage A owns exactly
two columns of its own: a lease (``skill_floor_claimed_at``) and a verdict
(``skill_floor_attempted_at``, written only once the batch's skills have
landed). Two readers of one work set is fine; two definitions of the set, or
two writers of one lifecycle column, is what this module was corrected for.
"""

from __future__ import annotations

import logging
from typing import Any, NamedTuple

from supabase import Client

from app.services.skill_extraction import ExtractedSkill, extract_skills, merge_zones

logger = logging.getLogger(__name__)

# Taxonomy keys are ~40 chars; 100 keeps the PostgREST `.in_()` URL bounded.
# An `.in_()` that grows with the data 400s with an opaque `Bad Request`.
_SKILL_KEY_CHUNK = 100
_FLOOR_PAGE_SIZE = 100  # job_ids are short; 100 keeps the by-id `.in_()` URL small
# Rows per job_skills upsert. A 100-job batch is ~1,000 rows; the body is JSON
# in a POST, so this bounds the request size, not a URL.
_UPSERT_CHUNK = 1000


def _resolve_skills(db: Client, taxonomy_keys: list[str]) -> dict[str, dict[str, Any]]:
    """``taxonomy_key`` → its ``skills`` row (id + what the matcher reads) for the
    keys the taxonomy table knows.

    Unresolved keys are dropped rather than inserted: ``job_skills.skill_id`` is
    a foreign key, so a key with no row is not a partial write, it is a failed
    one that takes the whole batch with it. A preview drops the same keys, so it
    scores exactly the rows a save would write.
    """
    resolved: dict[str, dict[str, Any]] = {}
    unique = list(dict.fromkeys(key for key in taxonomy_keys if key))
    for i in range(0, len(unique), _SKILL_KEY_CHUNK):
        chunk = unique[i:i + _SKILL_KEY_CHUNK]
        rows = (
            db.table("skills")
            .select("id, taxonomy_key, practice_mode, skill_kind")
            .in_("taxonomy_key", chunk)
            .execute()
        ).data or []
        for row in rows:
            key = row.get("taxonomy_key")
            if key and row.get("id") is not None:
                resolved[str(key)] = row
    return resolved


def floor_rows(db: Client, skills: list[ExtractedSkill]) -> list[dict[str, Any]]:
    """The ``job_skills`` rows these skills would become, in the matcher's read
    shape (``job_skills`` JOIN ``skills``) — without writing them.

    The extension's preview scores these with ``job_matcher.overlap``, so the
    number it shows before a save is the number the job carries after it.
    """
    merged = merge_zones(skills)
    resolved = _resolve_skills(db, [skill.taxonomy_key for skill in merged])
    return [
        {
            "is_primary": skill.is_must_have,
            "required_level": skill.required_level,
            "skills": {
                "taxonomy_key": skill.taxonomy_key,
                "practice_mode": resolved[skill.taxonomy_key].get("practice_mode"),
                "skill_kind": resolved[skill.taxonomy_key].get("skill_kind"),
            },
        }
        for skill in merged
        if skill.taxonomy_key in resolved
    ]


STAGE_A = "stage_a"
USER_CONFIRMED = "user_confirmed"


def write_skill_floor(
    db: Client,
    job_id: str,
    skills: list[ExtractedSkill],
    *,
    evidence_source: str = STAGE_A,
) -> int:
    """Persist one job's skills. Returns rows written. Never deletes."""
    return write_skill_floors(db, {job_id: skills}, evidence_source=evidence_source)[job_id]


def write_skill_floors(
    db: Client,
    floors: dict[str, list[ExtractedSkill]],
    *,
    evidence_source: str = STAGE_A,
) -> dict[str, int]:
    """Persist many jobs' skills in one resolve and one upsert. Returns rows
    written per job. Never deletes.

    One job at a time was two round trips per job — ~50 jobs a minute against
    this database, so a 14k-job scrape needed four hours and was killed at its
    two-hour timeout (2026-09-30). The rows are the same; only the trips change.

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
    merged = {job_id: merge_zones(skills) for job_id, skills in floors.items()}
    resolved = _resolve_skills(
        db, [skill.taxonomy_key for skills in merged.values() for skill in skills]
    )
    skill_ids = {key: int(row["id"]) for key, row in resolved.items()}
    written: dict[str, int] = {job_id: 0 for job_id in floors}
    payload: list[dict[str, Any]] = []
    for job_id, skills in merged.items():
        for skill in skills:
            if skill.taxonomy_key not in skill_ids:
                continue
            payload.append(
                {
                    "job_id": job_id,
                    "skill_id": skill_ids[skill.taxonomy_key],
                    "is_primary": skill.is_must_have,
                    "required_level": skill.required_level,
                    "evidence_source": evidence_source,
                }
            )
            written[job_id] += 1
    for i in range(0, len(payload), _UPSERT_CHUNK):
        db.table("job_skills").upsert(
            payload[i:i + _UPSERT_CHUNK], on_conflict="job_id,skill_id"
        ).execute()
    return written


class FloorGap(NamedTuple):
    """How much of the corpus is invisible to the matcher, and why.

    ``awaiting_stage_a`` is the one to alarm on: no floor and never attempted
    means the pipeline is not running. ``total`` also counts jobs Stage A has
    tried and legitimately found no taxonomy skill in — a backlog for Stage B's
    judgment pass, not a fault.
    """

    total: int
    recommendable: int
    awaiting_stage_a: int


def count_missing_floor(db: Client) -> FloorGap:
    """The floor gap, split into a stall signal and a known backlog.

    Reads the trigger-maintained `jobs.has_skill_floor` through a partial index.
    It used to be a live anti-join over 62k jobs x 376k skill rows, which
    exceeded Supabase's SERVER-side statement_timeout and returned 57014 no
    matter what the client timeout was. A monitor that throws every six hours is
    not a monitor.

    Not free: it visits every floorless row's heap page for the filters, 1.5s
    warm at 4,827 rows (2026-10-03). The heartbeat and the closer can afford
    that every six hours; a drain cannot afford it as its last step, where a
    57014 marked a finished drain as crashed (2026-10-01).
    """
    rows = db.rpc("count_jobs_missing_skill_floor", {}).execute().data or []
    row = rows[0] if isinstance(rows, list) and rows else (rows if isinstance(rows, dict) else {})
    return FloorGap(
        total=int(row.get("total") or 0),
        recommendable=int(row.get("recommendable") or 0),
        awaiting_stage_a=int(row.get("awaiting_stage_a") or 0),
    )


def claim_jobs_for_floor(
    db: Client,
    *,
    owner: str | None = None,
    limit: int = _FLOOR_PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Lease the next jobs needing a floor.

    ONE definition of the work set — ``jobs.has_skill_floor``, maintained by the
    same trigger that maintains ``role_family`` — read with FOR UPDATE SKIP
    LOCKED so a row is served to exactly one worker. The claim stamps Stage A's
    OWN lease and nothing else: ``enrichment_status`` belongs to the enrichment
    pipeline, and a pre-processor borrowing it is two owners of one column.

    A lease, not a verdict. The claim used to stamp ``skill_floor_attempted_at``
    itself, so a drain killed mid-batch left its jobs "attempted" with no skills
    — out of the work set for good (96 and 37 of them on 2026-09-30). A lease
    with no verdict is served again after 15 minutes, or at once to its own
    ``owner`` — the scrape run id, which RQ's retry of a killed drain carries —
    and :func:`settle_floor_claims` writes the verdict once the skills are down.

    It deliberately does not derive work from an anti-join over job_skills.
    That was a second, disagreeing answer to the same question, and it fought
    the transport besides — PostgREST truncates every response at 1,000 rows
    without erroring, so a partial work list looked exactly like a finished one.
    """
    return list(
        db.rpc("claim_skill_floor_lease", {"p_limit": limit, "p_owner": owner}).execute().data
        or []
    )


def settle_floor_claims(db: Client, job_ids: list[str]) -> None:
    """Record Stage A's verdict on leased jobs whose floor write has landed."""
    db.rpc("settle_skill_floor_claims", {"p_job_ids": job_ids}).execute()


def drain_skill_floor_queue(
    db: Client,
    *,
    owner: str | None = None,
    limit: int | None = None,
) -> dict[str, int]:
    """Floor every queued job. Returns counts so a caller can assert movement.

    A job whose text yields nothing is counted separately — that is a real
    answer about the posting, not a failure to hide.
    """
    seen = written = empty = 0
    while True:
        batch = claim_jobs_for_floor(db, owner=owner)
        if not batch:
            return {"jobs_seen": seen, "jobs_written": written, "jobs_empty": empty}
        floors = {
            str(job["job_id"]): extract_skills(
                str(job.get("job_title") or ""), str(job.get("job_description") or "")
            )
            for job in batch
        }
        rows = write_skill_floors(db, floors)
        # The verdict follows the write. Killed before this line, the lease
        # simply expires and the batch is served again.
        settle_floor_claims(db, list(floors))
        seen += len(floors)
        written += sum(1 for count in rows.values() if count)
        # Stage A found nothing in the rest. That is Stage A's answer, not the
        # corpus's: these are short summary blurbs naming no skill literally,
        # and a judgment model reading prose may still find one. The settled
        # verdict leaves them in Stage B's queue untouched.
        empty += sum(1 for count in rows.values() if not count)
        logger.info("metric skill_floor.drain_progress seen=%d written=%d empty=%d", seen, written, empty)
        if limit is not None and seen >= limit:
            logger.info("metric skill_floor.drain_stopped_at_limit limit=%d", limit)
            return {"jobs_seen": seen, "jobs_written": written, "jobs_empty": empty}
