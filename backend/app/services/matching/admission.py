"""Admission — may this person be shown this judged job, today?

A verdict is written once, against the targeting the person held when it was
computed. What they are shown is read against the targeting they hold NOW. The
three facts that can move between those moments are checked here, on read, for
every surface that shows a verdict:

- **closed** — the listing has been retired since it was judged.
- **location** — the job sits in none of the places they named
  (`match_credibility.location_compatible`, the city decision CONTEXT.md
  §Target Location already assigns there).
- **level** — the employer's stated years no longer overlap theirs
  (`job_eligibility.stated_range_admits`, the rule the pool admits by).

Before this module the /market list read score and verdict alone, while the
recommended flag also read the city. 24 of the 56 cards one person saw on
2026-09-28 were outside the cities they had confirmed, one of them a Brussels
requisition the scraper had tagged "India". Two surfaces, two answers to "can I
see this job" — the same shape as the Seniority Fit split.

A won't-take line is not checked here: a posting that breaks one is a Skip at
the write (`llm_ranker.gate_verdict`), and no surface shows a Skip. Pay is never
a reason to hide a job (`deal_breakers`).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.services.job_eligibility import stated_range_admits
from app.services.match_credibility import location_compatible

BarredBy = Literal["closed", "location", "level"]


@dataclass(frozen=True)
class Admission:
    barred_by: BarredBy | None

    @property
    def admitted(self) -> bool:
        return self.barred_by is None


def admit(profile: dict[str, Any], job: dict[str, Any]) -> Admission:
    """The first reason this job may not be shown, or none.

    An absent `is_active` is not a closed listing — only an explicit False is.
    """
    if job.get("is_active") is False:
        return Admission("closed")
    if not location_compatible(profile, job):
        return Admission("location")
    if not stated_range_admits(profile, job):
        return Admission("level")
    return Admission(None)


def admitted(profile: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Match rows (each carrying its `jobs` embed) this person may be shown."""
    return [row for row in rows if admit(profile, row.get("jobs") or {}).admitted]
