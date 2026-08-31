"""One answer to "what level is this user at, on this skill".

Four surfaces used to answer it four ways, from three different stores, in three
different scales: the market chip read `user_skills` and divided by every skill
the market had ever asked for (356 skills, 1,007 points — a denominator no human
can reach, where mastering one skill moved the number 0.3% and mastering all
twelve of the most-demanded moved it from 1% to 4%). Skill-path read the same
store and said "Skill level 2". The practice climb read `skill_assessed_level`
and rendered it under a CV badge, so "On CV · L0" meant "found on your CV, zero
rungs cleared" and was read as "your CV level is zero". The practice header
multiplied by twenty and said "8 below 40%".

The rule is one line and it now lives in exactly one place: **a skill's level is
the higher of what the CV evidences and what practice proved.** Everything else
here is the two shapes callers actually need.

Two facades, not one function with a mode flag — ADR-0002 settled that pattern
for the Mirror Score and the reasoning transfers exactly: "SQL has one canonical
query planner but does not expose it as run_query(mode=...)". The two cases are
not one case with an argument. `for_role` is a light read — levels and demand,
no bullets, no LLM. The job case is heavy: it needs the user's CV bullets and a
classification call to tell a latent gap from an absent one. Collapsing them
would make every chip render carry a classify path it never uses.

The job case still lives in `gap_planner` + its router, and imports `level_of`
from here so the rule cannot drift. Lifting that orchestration out of the HTTP
handler is a separate refactor with no user-visible change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from app.repositories.scores import ScoresRepository
from app.services.scoring.aspirations import fetch_role_family_market

logger = logging.getLogger(__name__)

Evidence = Literal["on_cv", "proven", "none"]

# How many skills a role's standing is measured against.
#
# A product choice, not a market fact, and it is the denominator the user reads:
# "3 / 12 core skills". Fixed rather than a threshold so the target is stable and
# comparable between two people chasing the same role — a per-user denominator
# ("3 / 40" for one, "3 / 11" for another) is not a number anyone can act on.
# Twelve is roughly what a role's job ads actually converge on; a job asks for
# seven (median), and the twelve most-demanded cover the recurring core.
CORE_SKILL_COUNT = 12


def level_of(cv_level: int | None, proven_level: int | None) -> tuple[int, Evidence]:
    """THE rule. The level, and which evidence backs it.

    Ties go to `on_cv`: work you actually did outranks a quiz you passed at the
    same level, and it is the stronger claim to show an employer.
    """
    cv = max(0, int(cv_level or 0))
    proven = max(0, int(proven_level or 0))
    if cv == 0 and proven == 0:
        return 0, "none"
    if cv >= proven:
        return cv, "on_cv"
    return proven, "proven"


@dataclass(frozen=True)
class SkillStanding:
    """Where a user stands on ONE skill the market asks for."""

    taxonomy_key: str
    level: int
    evidence: Evidence
    #: What the user's target families ask for. 0 when the market has no opinion.
    required_level: int
    #: Weighted demand across those families — the ranking key, not shown raw.
    demand: int

    @property
    def clears(self) -> bool:
        """At or above what the role asks. `required_level` 0 never counts as
        cleared — an unknown bar is not a met one."""
        return self.required_level > 0 and self.level >= self.required_level


@dataclass(frozen=True)
class RoleStanding:
    """The count the user reads beside their target role: `cleared / len(core)`.

    Not a percentage. A percentage invites "why am I not at 100" and hides what
    it is out of; a count is also a to-do list, and it moves by a whole visible
    unit every time the user finishes something — which the 1% it replaces was
    arithmetically incapable of doing.
    """

    core: list[SkillStanding]

    @property
    def cleared(self) -> int:
        return sum(1 for s in self.core if s.clears)

    @property
    def total(self) -> int:
        return len(self.core)


def for_role(
    scores_repo: ScoresRepository,
    user_id: str,
    target_roles: list[str],
    *,
    core_count: int = CORE_SKILL_COUNT,
) -> RoleStanding:
    """Where the user stands against the core skills of their target families.

    Empty when the user has no target set or the market read fails — callers
    render nothing rather than a zero, because "0 / 12" against an unknown market
    is a verdict on the user for something the market never told us.
    """
    if not target_roles:
        return RoleStanding(core=[])

    market = fetch_role_family_market(scores_repo, target_roles)
    if not market.demand:
        return RoleStanding(core=[])

    cv_levels = scores_repo.get_user_skill_level_map(user_id)
    proven_levels = scores_repo.get_user_proven_level_map(user_id)

    ranked = sorted(
        market.demand.items(),
        # Weight first, then the key, so a tie resolves the same way every read
        # — this feeds a number the user watches for movement.
        key=lambda kv: (-kv[1], kv[0]),
    )[:core_count]

    core: list[SkillStanding] = []
    for key, demand in ranked:
        level, evidence = level_of(cv_levels.get(key), proven_levels.get(key))
        core.append(
            SkillStanding(
                taxonomy_key=key,
                level=level,
                evidence=evidence,
                required_level=int(market.aspiration.get(key, 0) or 0),
                demand=int(demand or 0),
            )
        )
    return RoleStanding(core=core)
