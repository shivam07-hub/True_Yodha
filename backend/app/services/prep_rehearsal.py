"""prep_rehearsal — step 3's record, kept on the PERSON.

Design: `UNIFIED_PREP_V2.md` (repo root), step 3.

Myro is one platform. The user is upskilling; a job is the occasion for the
preparation, never its unit. Rehearsing "the Kotak 811 relaunch" out loud is a
thing the person did, and it does not become un-done because the next room is
at 3M instead of Sanofi.

The first version stored a set of requirement STRINGS under `job_deepenings`,
keyed by job — so the same story rehearsed in seven rooms started from zero
seven times, and the rail's own headline ("Clear a step once and it counts
wherever it applies") was false for step 3 by construction.

The join was already there: every room's cached coverage carries the `story_id`
that answers each requirement. Marking the STORY (`career_stories.rehearsed_at`)
makes the carry automatic and costs no extra read anywhere — the ladder is
already reading both sides.

A requirement with no story cannot be rehearsed. There is nothing to say yet;
that is step 1's problem, and counting it here would leave step 3 permanently
unclearable for anyone with an open gap.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services import prep_ladder
from app.services.jd_coverage import CACHE_PROMPT_KEY, CoverageResult, payload_to_result

logger = logging.getLogger("myro.prep_rehearsal")


def room_coverage(repo: Any, user_id: str, job_id: str) -> CoverageResult | None:
    """This room's cached coverage — never a fresh assessment.

    Step 3 is downstream of step 1 by design, and marking a question rehearsed
    must not be able to start a model run.
    """
    cached = payload_to_result(repo.get_deepening(user_id, job_id, CACHE_PROMPT_KEY))
    return cached[0] if cached else None


def read_state(repo: Any, user_id: str, job_id: str) -> dict[str, Any]:
    coverage = room_coverage(repo, user_id, job_id)
    rehearsed = set(repo.get_prep_user_state().get("rehearsed") or [])
    return _state(coverage, rehearsed)


def set_rehearsed(
    repo: Any, user_id: str, job_id: str, story_id: str, rehearsed: bool
) -> dict[str, Any]:
    """Mark or unmark ONE story, then answer with this room's whole state.

    One story per call, not a set: the record is now user-level, so a
    "replace the whole set" write from one room would silently clear stories
    rehearsed for a room the client cannot see. The story is the unit, so the
    write is idempotent and there is nothing to race
    ([[feedback_narrowing_a_race_is_not_closing_it]]).

    The story must be one THIS room actually leans on. Otherwise a job id and a
    story id together become a way to flip rows the surface never showed.
    """
    coverage = room_coverage(repo, user_id, job_id)
    allowed = set(prep_ladder.rehearsable_story_ids(coverage))
    if story_id in allowed:
        # RLS on career_stories is auth.uid() = user_id, so a story that is not
        # this user's simply matches no row.
        if not repo.set_story_rehearsed(story_id, rehearsed):
            logger.warning("rehearsal write matched no story row: %s", story_id)
    else:
        logger.warning("rehearsal refused: story %s is not asked by job %s", story_id, job_id)
    return _state(coverage, set(repo.get_prep_user_state().get("rehearsed") or []))


def _state(coverage: CoverageResult | None, rehearsed: set[str]) -> dict[str, Any]:
    ids = prep_ladder.rehearsable_story_ids(coverage)
    return {
        "rehearsed": [sid for sid in ids if sid in rehearsed],
        "answered": sum(1 for sid in ids if sid in rehearsed),
        "total": len(ids),
    }
