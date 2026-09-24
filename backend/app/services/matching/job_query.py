"""
services/matching/job_query.py — the JobQuery resolver.

Runs a canonical ``FilterSpec`` against the tuned repo SQL. It is a thin call
adapter: each method maps a spec (plus any user-context the feed needs) onto the
exact keyword call the repo already exposes, then returns the repo's raw result
dict. It does NOT rewrite public_job_query / search_jobs_by_filters —
those stay the single home of the query SQL. See CONTEXT.md "JobQuery".

There is no `feed` resolver: the authed /market list is not a filtered search.
`JobsRepository.shortlist_jobs` asks `candidates_for_user` for the forty jobs one
person should see, and a FilterSpec has nothing to say about it.
"""
from __future__ import annotations

from typing import Any

from app.services.matching.filter_spec import FilterSpec


class JobQuery:
    """One entry point for resolving a FilterSpec against a jobs repository."""

    @staticmethod
    def public(repo: Any, spec: FilterSpec) -> dict[str, Any]:
        """Landing NL search → real openings only ({rows, total, relaxed})."""
        return repo.public_job_query(**spec.public_kwargs())

    @staticmethod
    def company_drill(repo: Any, spec: FilterSpec) -> dict[str, Any]:
        """Company × skill drill-down (Intel → jobs at company)."""
        return repo.search_jobs_by_filters(**spec.company_drill_kwargs())
