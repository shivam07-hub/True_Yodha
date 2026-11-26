"""The landing's role chips and their two chapters (spec #66 L1).

Built inside the market analytics snapshot from the same job rows, so the public
read is a slice of a Tier-0 payload: no per-visitor database work
(ARCHITECTURE_READ_PATH.md, READ_PATH_PLAYBOOK.md "Make it Tier 0").

Which families qualify is the skill-demand rule applied to roles: at least three
employers, and no one employer holding more than 70% of the openings. Without it
one bank's bulk branch hiring reads as "the market". Residual taxonomy buckets
(`role_family_labels.is_catch_all`) are never proposed — the same flag Direction
uses to refuse "Business Operations" as somebody's primary.

A job with no stated seniority counts toward its family and the all-levels
skills, never toward a band: a band is what the employer said.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from typing import Any

from app.services.job_eligibility import PERSON_YEAR_SPAN_BY_BAND, seniority_for_job

ROLES_SHOWN = 8
MIN_EMPLOYERS = 3
MAX_EMPLOYER_SHARE = 0.70
#: A band under this many openings is greyed on the page: too few to read a
#: market from, however many employers they come from.
BAND_MIN_JOBS = 10
SKILLS_SHOWN = 6
TOP_COMPANIES = 3

BANDS: tuple[str, ...] = tuple(band for band, _lo, _hi in PERSON_YEAR_SPAN_BY_BAND)


def _spread_holds(companies: Counter[str]) -> bool:
    """Enough employers, and no one of them is most of the demand."""
    total = sum(companies.values())
    if total == 0 or len(companies) < MIN_EMPLOYERS:
        return False
    return companies.most_common(1)[0][1] / total <= MAX_EMPLOYER_SHARE


class _Slice:
    """Openings, employers and skill demand for one family, or one family-band."""

    def __init__(self) -> None:
        self.jobs = 0
        self.companies: Counter[str] = Counter()
        self.skill_jobs: Counter[str] = Counter()
        self.skill_companies: dict[str, Counter[str]] = {}

    def add(self, company: str, skills: Iterable[str]) -> None:
        self.jobs += 1
        if company:
            self.companies[company] += 1
        for skill in skills:
            self.skill_jobs[skill] += 1
            if company:
                self.skill_companies.setdefault(skill, Counter())[company] += 1

    def skills(self) -> list[dict[str, Any]]:
        """Top skills by share of this slice's openings, each passing the spread rule."""
        ranked = sorted(self.skill_jobs.items(), key=lambda item: (-item[1], item[0]))
        out: list[dict[str, Any]] = []
        for skill, count in ranked:
            if not _spread_holds(self.skill_companies.get(skill, Counter())):
                continue
            out.append({"skill": skill, "share": round(count / self.jobs, 2)})
            if len(out) == SKILLS_SHOWN:
                break
        return out


def _row_parts(row: dict[str, Any]) -> tuple[str, str, set[str]]:
    family = (row.get("role_family") or "").strip()
    company = (row.get("company_name") or "").strip()
    skills = {str(skill).strip() for skill in (row.get("main_skills") or []) if skill}
    skills.discard("")
    return family, company, skills


def compile_landing_roles(
    rows: Iterable[dict[str, Any]], *, catch_all: frozenset[str]
) -> list[dict[str, Any]]:
    """The eight families the landing offers, busiest first, with their bands."""
    rows = list(rows)
    families: dict[str, _Slice] = {}
    for row in rows:
        family, company, _skills = _row_parts(row)
        if not family or family in catch_all:
            continue
        families.setdefault(family, _Slice()).add(company, ())

    chosen = [
        name
        for name, part in sorted(families.items(), key=lambda item: (-item[1].jobs, item[0]))
        if _spread_holds(part.companies)
    ][:ROLES_SHOWN]
    if not chosen:
        return []

    wanted = set(chosen)
    whole: dict[str, _Slice] = {name: _Slice() for name in chosen}
    banded: dict[str, dict[str, _Slice]] = {name: {band: _Slice() for band in BANDS} for name in chosen}
    for row in rows:
        family, company, skills = _row_parts(row)
        if family not in wanted:
            continue
        whole[family].add(company, skills)
        band = seniority_for_job(row)
        if band in banded[family]:
            banded[family][band].add(company, skills)

    out: list[dict[str, Any]] = []
    for name in chosen:
        part = whole[name]
        bands = []
        for band in BANDS:
            piece = banded[name][band]
            thin = piece.jobs < BAND_MIN_JOBS or len(piece.companies) < MIN_EMPLOYERS
            bands.append(
                {
                    "band": band,
                    "jobs": piece.jobs,
                    "companies": len(piece.companies),
                    "thin": thin,
                    "skills": [] if thin else piece.skills(),
                }
            )
        out.append(
            {
                "family": name,
                "jobs": part.jobs,
                "companies": len(part.companies),
                "top_companies": [
                    {"name": company, "jobs": count}
                    for company, count in part.companies.most_common(TOP_COMPANIES)
                ],
                "skills": part.skills(),
                "bands": bands,
            }
        )
    return out
