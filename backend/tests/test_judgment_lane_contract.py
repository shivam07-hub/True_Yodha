"""No ranking, verdict or triage path may reach a small model.

The rule is old (`feedback_no_cheap_models_judgment`, ADR-0017) and the machinery
to enforce it exists — `JUDGMENT_OR_TIERS` drops any tier containing a model in
`_JUDGMENT_UNSAFE_MODELS`, by exclusion, so a reorder cannot leak one. What was
missing was anything checking that the ranking ROUTES actually use it.

They did not. Until 2026-08-04, `POST /jobs/feed/warm` (which decides the ten
cards a user sees first), `POST /jobs/{id}/brain` (the verdict and grade) and
`POST /jobs/analyse/{id}/stream` (the fit rationale, charged at 10 XP) all depended on
`get_interactive_provider`, whose lead tier is `google/gemma-3-4b-it` — the model
the tier table itself names for ranking banker jobs to a senior SWE with zero
errors. A confidently-wrong shortlist is invisible to fallback logic: nothing
errors, nothing retries, and the user simply gets the wrong jobs.

So the contract is asserted where it can be checked mechanically: at the route's
dependency, and at the resolved model list.
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.main import app
from app.services import llm_provider as lp

# Routes whose output IS a judgment — a rank, a verdict, a grade, a rationale.
# Add a route here the day it starts asking a model "is this job good for them".
JUDGMENT_ROUTES = {
    ("POST", "/jobs/feed/warm"),
    ("POST", "/jobs/{job_id}/brain"),
    ("POST", "/jobs/analyse/{job_id}/stream"),
}

# The factories that are allowed to serve them. Both derive their tiers from
# JUDGMENT_OR_TIERS, so neither can reach a small model.
JUDGMENT_SAFE_FACTORIES = {
    lp.get_judgment_provider,
    lp.get_blocking_judgment_provider,
    lp.get_writer_provider,
}

PROVIDER_FACTORIES = {
    lp.get_llm_provider,
    lp.get_interactive_provider,
    lp.get_cv_upload_provider,
    lp.get_paid_jobs_provider,
} | JUDGMENT_SAFE_FACTORIES


def _provider_factories_for(route: APIRoute) -> set:
    return {
        dependency.call
        for dependency in route.dependant.dependencies
        if dependency.call in PROVIDER_FACTORIES
    }


def test_every_judgment_route_uses_a_judgment_safe_provider() -> None:
    seen: set[tuple[str, str]] = set()
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods:
            key = (method, route.path)
            if key not in JUDGMENT_ROUTES:
                continue
            seen.add(key)
            factories = _provider_factories_for(route)
            assert factories, f"{key} declares no LLM provider dependency"
            unsafe = factories - JUDGMENT_SAFE_FACTORIES
            assert not unsafe, (
                f"{key} resolves a judgment call through "
                f"{sorted(f.__name__ for f in unsafe)} — that lane can reach a "
                "small model. Use get_blocking_judgment_provider (user waiting) "
                "or get_judgment_provider (background)."
            )
    missing = JUDGMENT_ROUTES - seen
    assert not missing, f"judgment routes vanished from the app — renamed or deleted? {missing}"


def test_judgment_safe_factories_cannot_reach_a_small_model() -> None:
    """The route contract above is only worth as much as this one.

    Asserted on the TIER TABLES rather than a built provider, because a provider
    built without API keys is empty and would pass vacuously.
    """
    for tiers in (lp.JUDGMENT_OR_TIERS, lp.WRITER_OR_TIERS):
        leaked = [m for tier in tiers for m in tier if m in lp._JUDGMENT_UNSAFE_MODELS]
        assert not leaked, f"small model on a judgment lane: {leaked}"


def test_the_interactive_lane_is_still_the_thing_being_guarded_against() -> None:
    """Falsifies the whole file: if the interactive lane ever stops carrying a
    small model, these assertions prove nothing and this suite should be
    re-derived rather than left as decoration."""
    interactive_tiers = lp.OR_TIERS[lp.FREE_OR_TIER_COUNT:]
    reachable = {m for tier in interactive_tiers for m in tier}
    assert reachable & lp._JUDGMENT_UNSAFE_MODELS, (
        "the interactive lane no longer reaches any small model — the judgment/"
        "interactive split may be obsolete; re-check before trusting this suite"
    )
