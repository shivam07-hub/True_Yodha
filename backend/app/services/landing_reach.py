"""The role a visitor picked on the landing, read against the CV they just
scored (spec #66 L7, Q8): which of the role's skills the CV holds, which it
lacks, and how many live jobs are within reach today.

**Within reach** = a live listing in the picked family, at the picked level
(every level when none was picked), that names at least `REACH_MIN_SHARED`
skills the CV holds. Not "half the job's skills": a CV and a listing share an
exact skill name rarely. Measured 2026-11-26 over 40 real accounts against
Business Analysis, Software Development, Banking Services and Customer Service
(0–2 and 2–5 years), a CV held 2–4% of a listing's named skills on average, so a
half-the-skills rule reads 0 for nearly everyone. Two shared skills is the line
where a listing asks for something this CV already shows.

The level is the employer's (`seniority_for_job`), the same cut the landing's
chapters count, so "within reach" is always a part of a number the visitor has
already seen as "open".

**Read path** (ARCHITECTURE_READ_PATH.md, Tier 0 after the first read): one
index per family in `shared_cache`, built from that family's live listings and
refreshed in the background. A visitor never pages the jobs table; a family is
read at most once per `_TTL_SECONDS`. Measured 2026-11-26 the read is ~1.2 s per
1,000 rows on `idx_jobs_live_role_family`; the largest family (Banking Services,
6,293 live) is seven pages. The index stores each distinct skill set once with
its count, by position in one vocabulary, so it is a fraction of the rows.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from typing import Any

from app.repositories.jobs import get_public_jobs_repository
from app.services import shared_cache
from app.services.job_eligibility import seniority_for_job

REACH_MIN_SHARED = 2

#: Liveness changes when the verifier runs, not by the minute: six hours fresh,
#: then served stale for a week while one replica rebuilds it.
_TTL_SECONDS = 6 * 3600
_STALE_SECONDS = 7 * 24 * 3600

#: The key a listing with no stated level files under. Never a band.
_UNSTATED = ""


def compile_family_reach(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """One family's live listings as `{jobs, vocab, sets}`.

    `jobs` counts every listing per level; `sets` holds, per level, each
    distinct skill set that could ever be within reach (at least
    `REACH_MIN_SHARED` skills) as `[[vocab positions], count]`.
    """
    jobs: Counter[str] = Counter()
    folded: dict[str, Counter[frozenset[str]]] = {}
    for row in rows:
        band = seniority_for_job(row) or _UNSTATED
        jobs[band] += 1
        skills = frozenset(str(skill).strip() for skill in (row.get("main_skills") or []) if skill and str(skill).strip())
        if len(skills) >= REACH_MIN_SHARED:
            folded.setdefault(band, Counter())[skills] += 1

    vocab: list[str] = []
    position: dict[str, int] = {}
    sets: dict[str, list[list[Any]]] = {}
    for band, counts in folded.items():
        entries = []
        for skills, count in counts.items():
            ids = []
            for skill in sorted(skills):
                if skill not in position:
                    position[skill] = len(vocab)
                    vocab.append(skill)
                ids.append(position[skill])
            entries.append([ids, count])
        sets[band] = entries
    return {"jobs": dict(jobs), "vocab": vocab, "sets": sets}


def count_within_reach(index: dict[str, Any], band: str | None, held: Iterable[str]) -> tuple[int, int]:
    """`(within reach, open)` at this level, or across every level when None."""
    held_cf = {skill.casefold() for skill in held}
    vocab: list[str] = index.get("vocab") or []
    have = {i for i, skill in enumerate(vocab) if skill.casefold() in held_cf}
    jobs: dict[str, int] = index.get("jobs") or {}
    sets: dict[str, list[list[Any]]] = index.get("sets") or {}
    bands = [band] if band else list(jobs)
    open_now = sum(int(jobs.get(b, 0)) for b in bands)
    reach = sum(
        int(count)
        for b in bands
        for ids, count in sets.get(b, [])
        if sum(1 for i in ids if i in have) >= REACH_MIN_SHARED
    )
    return reach, open_now


def role_gap(role: dict[str, Any], band: str | None, held: Iterable[str]) -> tuple[list[str], list[str]]:
    """Matched and missing among the skills the landing showed for this role:
    the level's when it was picked and has a market, else the role's."""
    skills = role.get("skills") or []
    if band:
        piece = next((item for item in role.get("bands") or [] if item.get("band") == band), None)
        if piece and not piece.get("thin") and piece.get("skills"):
            skills = piece["skills"]
    held_cf = {skill.casefold() for skill in held}
    names = [str(item["skill"]) for item in skills]
    return (
        [name for name in names if name.casefold() in held_cf],
        [name for name in names if name.casefold() not in held_cf],
    )


def family_reach_index(family: str) -> dict[str, Any]:
    """The family's index, shared by every visitor (see module docstring)."""
    return shared_cache.get_or_compute(
        f"landing_reach:{family}",
        lambda: compile_family_reach(get_public_jobs_repository().live_family_skill_rows(family)),
        ttl_seconds=_TTL_SECONDS,
        stale_seconds=_STALE_SECONDS,
    )
