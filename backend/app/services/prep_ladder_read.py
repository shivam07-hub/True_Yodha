"""prep_ladder_read — assemble the ladder for every live room in one wave.

Design: `UNIFIED_PREP_V2.md` (repo root).

The read shape, and why it is this shape (ARCHITECTURE_READ_PATH.md §2 budgets a
user-facing request at ≤3 concurrent reads, p95 < 500ms):

    1 sequential   job_applications — lean, and it produces the job_ids
    3 concurrent   job_deepenings · job_skills · user_skills

Four round trips, wave width three. The naive version is 3N — three
`get_deepening` calls per room — which is 33 round trips on an eleven-room
board for a rail that renders in one paint.

The response deliberately carries NO role or company: `/preparations` already
holds the applications list and joins on `job_id`. Repeating those strings here
would be the payload-weight trap with extra steps.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services import finlatics_match, prep_ladder
from app.services.concurrent_reads import run_concurrently
from app.services.jd_coverage import payload_to_result
from app.services.job_matcher import is_levelled_skill, wanted_skills

logger = logging.getLogger("myro.prep_ladder")

#: A room is live while it can still be worked. A closed room keeps its ladder
#: for the record but never enters the totals — a rejected application dragging
#: the board's "step 3 is 18%" down would be measuring the past.
LIVE_STATUSES = ("applied", "interviewing")

_FANOUT_LABEL = "preparations.ladder"


def _rehearsal_payload(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _rows_by_job(skill_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in skill_rows:
        job_id = str(row.get("job_id") or "")
        if job_id:
            grouped.setdefault(job_id, []).append(row)
    return grouped


def _gaps_for_job(
    rows: list[dict[str, Any]],
    user_levels: dict[str, int],
    company: str | None,
) -> list[finlatics_match.SkillGap]:
    """Every levelled ask this room makes that the user has not met, plus the
    asks that have no assessment at all.

    `has_drill=False` is the design's "the one level with no drill yet" — a
    requirement /practice cannot serve, where a partner programme is the only
    answer Myro has.
    """
    gaps: list[finlatics_match.SkillGap] = []
    for row in rows:
        skill = row.get("skills") or {}
        key = (skill.get("taxonomy_key") or "").strip()
        if not key:
            continue
        required = row.get("required_level") or (4 if row.get("is_primary") else 2)
        has_drill = is_levelled_skill(skill)
        if has_drill and (user_levels.get(key.lower(), 0) or 0) >= required:
            continue
        gaps.append(
            finlatics_match.SkillGap(
                taxonomy_key=key,
                required_level=int(required),
                company=company,
                has_drill=has_drill,
            )
        )
    return gaps


def _empty() -> dict[str, Any]:
    totals = prep_ladder.totals([])
    return {
        "rooms": [],
        "totals": {
            "step_pct": totals.step_pct,
            "bottleneck_step": totals.bottleneck_step,
            "rooms": 0,
        },
        "training": [],
        "training_note": finlatics_match.rail_note(has_gaps=False, bottleneck_step=1),
    }


def assemble(repo: Any, user_id: str) -> dict[str, Any]:
    """The whole rail's data: one entry per live room, the totals, the three cards."""
    rows = repo.get_application_rooms(user_id)
    live = [row for row in rows if str(row.get("status") or "") in LIVE_STATUSES]
    job_ids = [str(row["job_id"]) for row in live if row.get("job_id")]
    if not job_ids:
        return _empty()

    reads = run_concurrently(
        {
            "deepenings": lambda: repo.get_deepenings_for_jobs(
                user_id, job_ids, prep_ladder.DEEPENING_KEYS
            ),
            "skill_rows": lambda: repo.get_all_job_skill_rows(job_ids=job_ids),
            "user_levels": lambda: repo.get_user_skill_map(user_id),
        },
        label=_FANOUT_LABEL,
    )
    deepenings: dict[str, dict[str, str]] = reads["deepenings"] or {}
    by_job = _rows_by_job(reads["skill_rows"] or [])
    user_levels: dict[str, int] = reads["user_levels"] or {}

    rooms: list[dict[str, Any]] = []
    all_gaps: list[finlatics_match.SkillGap] = []
    for row in live:
        job_id = str(row["job_id"])
        cached = deepenings.get(job_id, {})
        job_rows = by_job.get(job_id, [])

        coverage = payload_to_result(cached.get(prep_ladder.COVERAGE_KEY))
        steps = [
            prep_ladder.evidence_step(coverage[0] if coverage else None),
            prep_ladder.level_step(wanted_skills(job_rows), user_levels),
            prep_ladder.rehearsal_step(
                _rehearsal_payload(cached.get(prep_ladder.REHEARSAL_KEY))
            ),
            prep_ladder.brief_step(cached.get(prep_ladder.BRIEF_KEY)),
        ]
        rooms.append(
            {
                "job_id": job_id,
                "steps": steps,
                "pct": prep_ladder.room_pct(steps),
                "current_step": prep_ladder.current_step(steps),
                "levels": prep_ladder.level_rows(job_rows, user_levels),
            }
        )
        all_gaps.extend(_gaps_for_job(job_rows, user_levels, row.get("company")))

    totals = prep_ladder.totals([room["steps"] for room in rooms])
    matches = finlatics_match.select(all_gaps)
    return {
        "rooms": rooms,
        "totals": {
            "step_pct": totals.step_pct,
            "bottleneck_step": totals.bottleneck_step,
            "rooms": totals.rooms,
        },
        "training": [
            {"program_id": m.program_id, "why": m.why, "matched": m.matched}
            for m in matches
        ],
        "training_note": finlatics_match.rail_note(
            has_gaps=bool(all_gaps), bottleneck_step=totals.bottleneck_step
        ),
    }
