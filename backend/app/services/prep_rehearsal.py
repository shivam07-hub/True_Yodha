"""prep_rehearsal — step 3's record: which questions this user has worked.

Design: `UNIFIED_PREP_V2.md` (repo root), step 3.

Before this, rehearsal was a pure projection — the coverage rows re-phrased as
interview questions — and it recorded nothing. The ladder therefore read step 3
as "not started" for every user forever, and a step that can never be cleared
is a step nobody works. This is the missing write.

The state is the SET of requirements rehearsed, not a count. A count cannot
survive the JD being re-parsed: the requirement list changes underneath it and
a stored "6 of 6" silently becomes a lie. Storing the set lets every read
recompute against the live questions, which is also what lets the step drop
back out of "clear" when new requirements appear — the honest behaviour.

Stored in `job_deepenings` under `prep_rehearsal`, the same table the coverage
assessment and the day-of brief already use, so the ladder reads all three
steps in one round trip ([[feedback_reuse_canonical_table]]).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services import prep_ladder
from app.services.jd_coverage import CACHE_PROMPT_KEY, payload_to_result

logger = logging.getLogger("myro.prep_rehearsal")


def current_requirements(repo: Any, user_id: str, job_id: str) -> list[str]:
    """The questions step 3 projects — the cached coverage rows, nothing new.

    Never triggers an assessment: rehearsal is downstream of step 1 by design,
    and a toggle must not be able to start a model run.
    """
    cached = payload_to_result(repo.get_deepening(user_id, job_id, CACHE_PROMPT_KEY))
    if not cached:
        return []
    return [item.requirement for item in cached[0].requirements]


def read_state(repo: Any, user_id: str, job_id: str) -> dict[str, Any]:
    requirements = current_requirements(repo, user_id, job_id)
    stored = _stored(repo, user_id, job_id)
    return _state(stored, requirements)


def write_state(
    repo: Any, user_id: str, job_id: str, rehearsed: list[str]
) -> dict[str, Any]:
    """Replace the set with the client's, filtered to questions that exist.

    The client sends the WHOLE set rather than one toggle, so there is no
    read-then-write window for two quick taps to race through
    ([[feedback_narrowing_a_race_is_not_closing_it]]). Filtering against the
    live requirements is also what stops this endpoint being a place to store
    arbitrary strings.
    """
    requirements = current_requirements(repo, user_id, job_id)
    live = {r.strip().lower(): r for r in requirements if r.strip()}
    kept = []
    seen: set[str] = set()
    for item in rehearsed:
        if not isinstance(item, str):
            continue
        key = item.strip().lower()
        if key in live and key not in seen:
            seen.add(key)
            kept.append(live[key])
    repo.upsert_deepening(
        user_id, job_id, prep_ladder.REHEARSAL_KEY, json.dumps({"rehearsed": kept})
    )
    return _state({"rehearsed": kept}, requirements)


def _stored(repo: Any, user_id: str, job_id: str) -> dict | None:
    raw = repo.get_deepening(user_id, job_id, prep_ladder.REHEARSAL_KEY)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("prep_rehearsal payload is not JSON for job %s", job_id)
        return None
    return parsed if isinstance(parsed, dict) else None


def _state(stored: dict | None, requirements: list[str]) -> dict[str, Any]:
    live = {r.strip().lower() for r in requirements if r.strip()}
    kept = [
        item
        for item in (stored or {}).get("rehearsed", [])
        if isinstance(item, str) and item.strip().lower() in live
    ]
    return {
        "rehearsed": kept,
        "answered": prep_ladder.rehearsed_count(stored, requirements),
        "total": len(requirements),
    }
