"""passed_on — the directions a user has told us, twice, that they do not want.

Skip reasons have been collected since the Job Intelligence module shipped and
read by nothing: 10 of 194 skips carry one, and `frontend/lib/jobs/feedback.ts`
told the reader they "train only the user's own ranking" while no code path
looked at them. This module is what makes that sentence true.

WHAT A SKIP CAN AND CANNOT SAY. "Not my role" lands on a JOB, and under ADR-0022
a job is not filed in one bucket — it fits every direction whose characteristic
skills it asks for. So a skip is read the way the platform reads everything
else: grade the skipped job against the corpus, and count which directions keep
coming back. Two skips make a pattern (Shivam, 2026-09-16); one is a bad
listing.

WHAT IT NEVER DOES. It never passes on a direction the user chose themselves.
Saying "not my role" to a job inside your own target means your target may be
wrong, and that is a change only the user makes — silently dropping it would
leave them with a direction on screen that Myro had quietly stopped searching.

It never passes on a SKILL either, which is the question Shivam asked: a sales
role asking for stakeholder management still grades against Sales Management's
own profile after a tech role asking for the same skill is skipped. Directions
are named skill profiles, and only whole profiles are passed on.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from app.services.matching import direction_fit

logger = logging.getLogger(__name__)

#: Skips this old stop counting. A direction someone rejected in March is not
#: evidence about the person they are now.
WINDOW_DAYS = 90

#: How many skips in one direction before Myro stops picking it. Two, not one:
#: one bad listing inside a good direction is a listing problem, and the cost of
#: being wrong here is a direction that silently disappears from someone's band.
PASS_THRESHOLD = 2

#: A user cannot reject their way out of the whole corpus. Past this many
#: directions the signal is "my direction is wrong", not "not this one", and the
#: honest answer is the Direction step, not a longer exclusion list.
MAX_PASSED_ON = 12


def vocabularies(core_by_family: Mapping[str, Sequence[str]]) -> dict[str, frozenset[str]]:
    """Each direction's vocabulary, normalised once for the whole count.

    Built here rather than inside the per-job loop: the corpus holds ~337
    directions, and a skip set is counted against all of them.
    """
    return {
        family: direction_fit.vocabulary({family: core}, [family])
        for family, core in core_by_family.items()
    }


def directions_for(
    job_skills: Sequence[str] | None, vocab_by_family: Mapping[str, frozenset[str]]
) -> set[str]:
    """Every direction this job fits — the same 2-of-12 rule the card is graded on.

    A job fits more than one; that is the point of ADR-0022, and the reason this
    counts directions rather than assigning one.
    """
    if not job_skills:
        return set()
    return {
        family
        for family, vocab in vocab_by_family.items()
        if direction_fit.grade(job_skills, vocab).is_on_direction
    }


def select_passed_on(
    skipped_job_skills: Sequence[Sequence[str] | None],
    core_by_family: Mapping[str, Sequence[str]],
    *,
    target_families: Sequence[str] = (),
    threshold: int = PASS_THRESHOLD,
) -> set[str]:
    """Pure: the directions that reached the threshold, minus the user's own.

    Ordered by nothing — it is a set, and the caller that shows it to the user
    decides how to read it out.
    """
    vocab_by_family = vocabularies(core_by_family)
    counts: dict[str, int] = {}
    for skills in skipped_job_skills:
        for family in directions_for(skills, vocab_by_family):
            counts[family] = counts.get(family, 0) + 1
    mine = {str(f).strip() for f in target_families if str(f).strip()}
    passed = {family for family, n in counts.items() if n >= threshold and family not in mine}
    if len(passed) <= MAX_PASSED_ON:
        return passed
    # Keep the ones they rejected hardest; the rest is a targeting conversation.
    ranked = sorted(passed, key=lambda f: (-counts[f], f))
    logger.info("metric passed_on.capped directions=%d kept=%d", len(passed), MAX_PASSED_ON)
    return set(ranked[:MAX_PASSED_ON])


@dataclass(frozen=True)
class PassedOn:
    """What the user has rejected twice, and the vocabulary to spot it again.

    Both halves come from one read: the names are what a surface tells the user,
    the vocabularies are what the pick gate grades against. A caller that had to
    re-read the snapshot to turn one into the other would be paying twice for
    the same answer.
    """

    families: frozenset[str]
    vocabularies: tuple[frozenset[str], ...]

    def __bool__(self) -> bool:
        return bool(self.families)


NOTHING_PASSED_ON = PassedOn(families=frozenset(), vocabularies=())


def for_user(repo: Any, user_id: str, *, target_families: Sequence[str] = ()) -> PassedOn:
    """The user's passed-on directions, read from their own skip reasons.

    Three small reads on a background path (the pick regen), never on a read the
    user is waiting for. Fail-soft: if any of them cannot be read the answer is
    "nothing is passed on", which shows MORE jobs rather than fewer — the
    harmless side of this rule.
    """
    from app.repositories.role_families import RoleFamiliesRepository

    try:
        # A user who asked to see those directions again starts from that moment.
        # The evidence stays; only the counting window moves.
        job_ids = repo.recent_personal_feedback_job_ids(
            user_id,
            reason_code="not_my_role",
            days=WINDOW_DAYS,
            since=repo.passed_on_cleared_at(user_id),
        )
        if len(job_ids) < PASS_THRESHOLD:
            return NOTHING_PASSED_ON
        skills_by_job = repo.main_skills_by_ids(job_ids)
        core_by_family = RoleFamiliesRepository(repo.client).all_core_skills()
        if not core_by_family:
            return NOTHING_PASSED_ON
        families = select_passed_on(
            [skills_by_job.get(jid) for jid in job_ids],
            core_by_family,
            target_families=target_families,
        )
        if not families:
            return NOTHING_PASSED_ON
        vocab_by_family = vocabularies({f: core_by_family[f] for f in families})
        return PassedOn(
            families=frozenset(families),
            vocabularies=tuple(vocab_by_family[f] for f in sorted(families)),
        )
    except Exception as exc:  # noqa: BLE001 — documented degradation
        logger.warning("metric passed_on.read_failed user=%s error=%s", user_id, exc)
        return NOTHING_PASSED_ON


def is_passed_on(job_skills: Sequence[str] | None, vocabularies: Sequence[frozenset[str]]) -> bool:
    """Does this job fit a direction the user has rejected twice?

    Graded per direction, never against a union of them: two hits spread across
    two different passed-on directions is not the same job, and treating it as
    one would hide roles nobody rejected.
    """
    return any(direction_fit.grade(job_skills, vocab).is_on_direction for vocab in vocabularies)
