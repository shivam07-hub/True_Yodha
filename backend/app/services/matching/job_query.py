"""
services/matching/job_query.py — the JobQuery resolver.

Runs a canonical ``FilterSpec`` against the tuned repo SQL. It is a thin call
adapter: each method maps a spec (plus any user-context the feed needs) onto the
exact keyword call the repo already exposes, then returns the repo's raw result
dict. It does NOT rewrite feed_jobs / public_job_query / search_jobs_by_filters —
those stay the single home of the query SQL. See CONTEXT.md "JobQuery".
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
    def feed(
        repo: Any,
        spec: FilterSpec,
        *,
        user_skill_keys: set[str] | None = None,
        user_target_roles: list[str] | None = None,
        primary_career_band: str | None = None,
        explored_career_bands: list[str] | None = None,
        target_seniority: str = "any",
        exclude_job_ids: set[str] | None = None,
        followed_companies: set[str] | None = None,
    ) -> dict[str, Any]:
        """Authed /market triage feed. The spec carries the user-expressed query
        dimensions; the personal context (CV skills, target roles, the draining-queue
        exclusions, the follow set) is injected here so the spec stays a pure,
        cacheable description of the search."""
        return repo.feed_jobs(
            **spec.feed_kwargs(),
            user_skill_keys=user_skill_keys,
            user_target_roles=user_target_roles,
            primary_career_band=primary_career_band,
            explored_career_bands=explored_career_bands,
            target_seniority=target_seniority,
            followed_companies=followed_companies,
            exclude_job_ids=exclude_job_ids,
        )

    @staticmethod
    def company_drill(repo: Any, spec: FilterSpec) -> dict[str, Any]:
        """Company × skill drill-down (Intel → jobs at company)."""
        return repo.search_jobs_by_filters(**spec.company_drill_kwargs())
