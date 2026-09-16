"""direction_fit — does this job ask for the work the user is aiming at?

ADR-0022: no job and no skill is stored as a member of one bucket, and every fit
is a graded score computed from skills. This module owns ONE of those three
grades — job ↔ direction — for every surface that shows it: the pick gate, the
Career Ops evaluation, and the card's tag.

THE RULE, AND WHY IT IS THIS ONE. A job fits a direction when it asks for at
least two of that direction's twelve most-demanded skills. BACKLOG #46 S4
measured it at 76% precision / 40% reach, against 71% / 29% for asking which
bucket the job was filed in.

WHY THIS IS PURE. S4 was deferred on cost: grading all 46,801 live jobs per
request measured 5.8-23.2s on the shared instance. That price is corpus scale.
The sets this module grades are a pick band (8), a triage pool (tens), or one
opened job, and both sides of the comparison are already in memory — a job row
carries `main_skills`, and a direction's vocabulary is one text[] on the
`role_family_labels` snapshot (`core_skills`, migration 20260916100000). So the
grade costs no read and no model call.

Measured 2026-09-16 over the 3,000 most recently seen live jobs: grading
`main_skills` against those twelve names finds 736 of the 780 jobs a full
`job_skills` join finds for Business Operations (94%) and 256 of 260 for Sales
Management (98%). The earlier attempt used `role_family_labels.top_skills` and
found 102 and 24 — because `top_skills` ranks by tf-idf DISTINCTIVENESS and is
capped at eight, so it names skills that are rare in the jobs it should match.
Two arrays, two questions: `top_skills` says what is distinctive about a
direction, `core_skills` says what it asks for.

NOT A SELECTOR. This grades jobs already in hand; it never chooses which jobs to
read. The bucket index (`jobs.role_family`) stays as the cheap RECALL device
that narrows 46,801 rows to a pool — a different job from deciding fit, and the
distinction is what keeps one definition of "does this job fit" rather than two
(BACKLOG #46, "do not ship half of it"). When the paid compute gate opens and
the pool snapshot lands, the selector reads that snapshot and this rule is still
the only grader.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal, Mapping, Sequence

#: How many of a direction's most-demanded skills form its vocabulary. Stored by
#: `refresh_direction_core_skills`; restated here only so a caller reading this
#: module knows the shape it is handed.
CORE_SKILLS = 12

#: Hits needed before a job counts as the work the user asked for. The measured
#: knee (#46 S4): one hit is noise on skills like Communication, three loses the
#: honest neighbours.
FIT_MIN_HITS = 2

Verdict = Literal["on_direction", "off_direction", "unknown"]


def _normalise(name: object) -> str:
    """Compare on the name, not on its whitespace or case.

    Both sides are Stage A display names (100% of `top_skills` names resolve in
    `skills.display_name`), so an exact match would almost always work. Almost
    is the reason this exists: a scraper row that arrives with a double space
    must not read as a different skill.
    """
    return " ".join(str(name or "").split()).casefold()


@dataclass(frozen=True)
class DirectionFit:
    """The grade, plus the evidence for it.

    `matched` carries the job's own spelling of the skills that earned the
    verdict, so the surface that explains the tag ("asks for Python and SQL,
    which your direction demands") does not recompute the intersection or
    re-case the names.
    """

    verdict: Verdict
    matched: tuple[str, ...]

    @property
    def is_on_direction(self) -> bool:
        return self.verdict == "on_direction"

    @property
    def hits(self) -> int:
        return len(self.matched)


UNKNOWN = DirectionFit(verdict="unknown", matched=())


def vocabulary(
    core_skills_by_family: Mapping[str, Sequence[str]],
    families: Iterable[str],
) -> frozenset[str]:
    """The union of the user's directions, normalised once per request.

    A union, not a per-family grade: a person aiming at two directions is aiming
    at both, and a job that serves either is the work they asked for. Families
    the snapshot has never heard of contribute nothing — a scoping key naming a
    direction that does not exist is a known failure mode, and it must read as
    "we cannot grade this", never as "nothing fits".
    """
    names: set[str] = set()
    for family in families:
        for skill in core_skills_by_family.get(family) or ():
            key = _normalise(skill)
            if key:
                names.add(key)
    return frozenset(names)


def grade(job_skills: Sequence[str] | None, vocab: frozenset[str]) -> DirectionFit:
    """Grade ONE job against a direction vocabulary.

    `unknown` when either side is empty — a direction we cannot grade against,
    or a listing that names no skills. Absence is not a verdict (CONTEXT.md):
    calling an ungradable job "off direction" would hide it, and calling it "on"
    would promote it, both on the strength of missing data.
    """
    if not vocab or not job_skills:
        return UNKNOWN
    matched: list[str] = []
    seen: set[str] = set()
    for skill in job_skills:
        key = _normalise(skill)
        if not key or key in seen or key not in vocab:
            continue
        seen.add(key)
        matched.append(str(skill).strip())
    verdict: Verdict = "on_direction" if len(matched) >= FIT_MIN_HITS else "off_direction"
    return DirectionFit(verdict=verdict, matched=tuple(matched))


def grade_all(
    jobs: Iterable[Mapping[str, object]],
    vocab: frozenset[str],
    *,
    skills_key: str = "main_skills",
    id_key: str = "job_id",
) -> dict[str, DirectionFit]:
    """Grade a pool in one pass, keyed by job id.

    The pool shapes this module serves (`get_agent_picks` rows, the triage pool,
    a warmed feed page) all carry the job's skills under `main_skills`; the key
    is an argument so a caller holding a different shape says so rather than
    reshaping its rows to suit this module.
    """
    out: dict[str, DirectionFit] = {}
    for job in jobs:
        job_id = str(job.get(id_key) or "")
        if not job_id:
            continue
        raw = job.get(skills_key)
        out[job_id] = grade(raw if isinstance(raw, (list, tuple)) else None, vocab)
    return out
