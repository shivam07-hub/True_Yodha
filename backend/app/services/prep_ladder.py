"""prep_ladder — the four steps every prep room walks (Unified Prep v2, 2b).

Design: `UNIFIED_PREP_V2.md` (repo root).

    Four identical steps — evidence, level, rehearsal, brief. Same shape in the
    rail, in the room, on mobile. The platform reads as one machine.

One shape everywhere: the rail's pips, the room's readiness band and the mobile
stack all render THIS list, in this order. A step is 0 (not started), 1
(started) or 2 (clear), so a room's readiness is `sum(steps) / 8`.

Every step reads a signal that ALREADY EXISTS. Nothing in this module runs a
model, and nothing here writes:

    1 evidence   job_deepenings['jd_coverage']    cached coverage assessment
    2 level      job_skills required vs user_skills matched
    3 rehearsal  job_deepenings['prep_rehearsal']
    4 brief      job_deepenings['prep_brief']

A step with no signal is `NOT_STARTED`, never a guess. "Not started" is true;
inferring progress the room cannot show is how a ladder starts lying.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.jd_coverage import CoverageResult
from app.services.job_matcher import is_levelled_skill

STEP_COUNT = 4
NOT_STARTED = 0
STARTED = 1
CLEAR = 2
_MAX_ROOM_SCORE = STEP_COUNT * CLEAR

#: `job_deepenings.prompt_key` for each step that persists one.
COVERAGE_KEY = "jd_coverage"
REHEARSAL_KEY = "prep_rehearsal"
BRIEF_KEY = "prep_brief"
DEEPENING_KEYS = (COVERAGE_KEY, REHEARSAL_KEY, BRIEF_KEY)

#: Rail legend + room labels. Index is the step number - 1.
STEP_LABELS = ("Evidence", "Skill level", "Rehearsal", "Day-of brief")


def evidence_step(coverage: CoverageResult | None) -> int:
    """Step 1. Clear when every parsed requirement has an answer behind it.

    `weak` counts: an adjacent story is not proof, and the coverage panel still
    asks for a better one. Treating weak as clear would mark the step done
    while the panel underneath it is still asking a question.
    """
    if coverage is None or not coverage.requirements:
        return NOT_STARTED
    if coverage.gap == 0 and coverage.weak == 0:
        return CLEAR
    if coverage.covered > 0:
        return STARTED
    return NOT_STARTED


def level_step(wanted: dict[str, int], user_levels: dict[str, int]) -> int:
    """Step 2. The levels this job tests, against the levels the user holds.

    `wanted` is `job_matcher.wanted_skills` output — levelled skills only, so a
    soft or scenario-mode skill never lands here. `user_levels` is keyed
    lowercase (`JobsRepository.get_user_skill_map`).

    A job with NO levelled skills reads as CLEAR, not as not-started: there is
    nothing left to close, and holding it at 0 would cap the room at 75%
    forever. The step-2 card says so in words rather than showing a green pip
    with no explanation.
    """
    if not wanted:
        return CLEAR
    met = 0
    partial = 0
    for key, required in wanted.items():
        held = user_levels.get(key.lower(), 0) or 0
        if held >= required:
            met += 1
        elif held > 0:
            partial += 1
    if met == len(wanted):
        return CLEAR
    if met or partial:
        return STARTED
    return NOT_STARTED


def level_rows(
    rows: list[dict],
    user_levels: dict[str, int],
) -> list[dict]:
    """Step 2's detail: every level this job tests, and where the user is.

    Renders the design's rungs — "You're L1 · this job asks L3" — so the card
    can say what it is asking for before the drill starts. `has_drill` False is
    "No assessment exists yet": /practice cannot serve that skill at all, and
    the room says so rather than offering a CTA it cannot honour.

    Met levels are kept, not filtered: a card that only ever shows what is
    missing never shows the user anything they have cleared.
    """
    out: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        skill = row.get("skills") or {}
        key = (skill.get("taxonomy_key") or "").strip()
        if not key or key.lower() in seen:
            continue
        seen.add(key.lower())
        required = int(row.get("required_level") or (4 if row.get("is_primary") else 2))
        out.append({
            "name": key,
            "held": int(user_levels.get(key.lower(), 0) or 0),
            "required": required,
            "has_drill": is_levelled_skill(skill),
        })
    # Deepest unmet ask first — the card's CTA should point at the biggest gap.
    out.sort(key=lambda r: (r["held"] >= r["required"], -(r["required"] - r["held"])))
    return out


def rehearsal_step(payload: dict | None) -> int:
    """Step 3. Rehearsal is a count of questions worked, out of the questions
    the coverage rows project. Absent payload → nobody has rehearsed."""
    if not payload:
        return NOT_STARTED
    answered = int(payload.get("answered") or 0)
    total = int(payload.get("total") or 0)
    if answered <= 0:
        return NOT_STARTED
    if total > 0 and answered >= total:
        return CLEAR
    return STARTED


def brief_step(payload: str | None) -> int:
    """Step 4. The day-of brief is one-shot — it exists or it does not."""
    return CLEAR if (payload or "").strip() else NOT_STARTED


def room_pct(steps: list[int]) -> int:
    """Readiness as the rail and the ring both render it: 0-100."""
    if not steps:
        return 0
    return round(100 * sum(steps) / _MAX_ROOM_SCORE)


def current_step(steps: list[int]) -> int:
    """1-based number of the step the user is ON — the first not yet clear.

    All four clear → 4, so the room head never claims a fifth step.
    """
    for index, value in enumerate(steps):
        if value < CLEAR:
            return index + 1
    return STEP_COUNT


@dataclass
class LadderTotals:
    """The cross-room footer: where the whole board actually stalls."""

    step_pct: list[int]
    bottleneck_step: int
    rooms: int


def totals(step_lists: list[list[int]]) -> LadderTotals:
    """Progress per step across every LIVE room, plus the worst one.

    Weighted (a started step counts half), matching `room_pct`. A pure
    clear/not-clear tally would round eleven rooms into 9-point jumps and make
    the footer look like it never moves.
    """
    if not step_lists:
        return LadderTotals(step_pct=[0] * STEP_COUNT, bottleneck_step=1, rooms=0)
    pct: list[int] = []
    for index in range(STEP_COUNT):
        scored = sum(steps[index] for steps in step_lists if len(steps) > index)
        pct.append(round(100 * scored / (CLEAR * len(step_lists))))
    return LadderTotals(
        step_pct=pct,
        bottleneck_step=pct.index(min(pct)) + 1,
        rooms=len(step_lists),
    )
