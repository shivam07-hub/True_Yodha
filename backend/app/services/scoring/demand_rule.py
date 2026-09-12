"""The one rule that turns market counts into a target level.

It lived in two places. `career_skill_path_cards.required_level` said a skill
must be must-have in more than half a band's jobs for L4, else L3.
`ScoresRepository.get_role_family_market` said the same thing in code while its
own docstring claimed L3 needed 25% — so a gap targeted by one and displayed by
the other could disagree, and nobody could say which was the rule.

It reads `jobs_must_have` — how many jobs in the scope name the skill in the
must-have zone (`required_level >= 4`) — and never `is_primary`. SKILL_ENGINE
Lock 4 retires that flag, and the corpus shows it carries nothing extra: on
Stage A rows `is_primary` is exactly `required_level = 4` restated (211,116
level-4 rows are 100% primary, 283,766 level-2 rows are 0%), while on the
296,886 legacy enrichment rows it is a 94.7% constant. Dropping it moved 460 of
Software Development's 2,096 skills from a level-3 target to level 2 — targets
that existed only because the constant said "primary".
"""

from __future__ import annotations

MUST_HAVE_MAJORITY = 0.5


def target_level(*, jobs_must_have: int, job_count: int, present: bool) -> int | None:
    """The level this scope demands a skill at, or None when it does not.

    must-have in more than half the jobs -> 4
    must-have in at least one            -> 3
    named at all                         -> 2
    """
    if job_count <= 0:
        return None
    if jobs_must_have > 0:
        return 4 if jobs_must_have / job_count > MUST_HAVE_MAJORITY else 3
    if present:
        return 2
    return None
