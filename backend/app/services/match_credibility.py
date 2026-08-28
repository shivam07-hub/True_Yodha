"""Deterministic gates for promoted job recommendations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.jobs import SeniorityCompat
from app.services.job_eligibility import seniority_for_job
from app.services.onboarding_service import context_key


@dataclass(frozen=True)
class Credibility:
    recommendation: str | None
    seniority_compatibility: SeniorityCompat
    context_hash: str | None
    credible: bool


def seniority_compatibility(target: str, job: dict[str, Any]) -> SeniorityCompat:
    if target in ("", "any"):
        return "compatible"
    actual = seniority_for_job(job)
    if not actual:
        return "unknown"
    return "compatible" if actual == target else "incompatible"


def _location_token(value: str) -> str:
    lowered = value.casefold().replace("bangalore", "bengaluru")
    lowered = lowered.replace("gurgaon", "gurugram").replace("delhi / ncr", "delhi ncr")
    return " ".join(lowered.replace(",", " ").split())


def _profile_locations(profile: dict[str, Any]) -> list[str]:
    """Every location the user targets, scalar-only profiles included."""
    raw = profile.get("target_locations")
    values = raw if isinstance(raw, list) else [profile.get("target_location")]
    return [token for token in (_location_token(str(v or "")) for v in values) if token]


def _profile_countries(profile: dict[str, Any]) -> list[str]:
    raw = profile.get("target_location_countries")
    values = raw if isinstance(raw, list) else [profile.get("target_location_country")]
    return [token for token in (_location_token(str(v or "")) for v in values) if token]


def _target_matches(target: str, countries: list[str], job: dict[str, Any]) -> bool:
    """Does this ONE stated location cover this job?"""
    if "remote" in target:
        return str(job.get("location_mode") or "").casefold() == "remote"
    job_country = _location_token(str(job.get("location_country") or ""))
    if "all" in target and countries:
        return job_country in countries
    # "Bengaluru, India" carries its own country; strip it to compare cities.
    city = target
    for country in countries:
        if country and country in city:
            city = _location_token(city.split(country, 1)[0])
            break
    job_city = _location_token(str(job.get("location_city") or ""))
    job_location = _location_token(str(job.get("location") or ""))
    return bool(city and (city == job_city or city in job_location))


def location_compatible(profile: dict[str, Any], job: dict[str, Any]) -> bool:
    """True when the job sits in ANY location the user named.

    This gate used to read `target_location` alone. A user targeting Mumbai and
    Bengaluru had every Bengaluru job judged against Mumbai and marked
    incompatible — the second city was accepted at every input surface and then
    filtered back out here, one job at a time.
    """
    targets = _profile_locations(profile)
    if not targets:
        return True
    # F4: a job dict with NO location signal at all reached this gate from a lean
    # caller that didn't attach location meta. The candidate pool already location-
    # filtered upstream, so a metaless job here was pool-approved — absent meta is not
    # a mismatch. Barring it is a false negative that silently blocks recommendations.
    if not any(
        str(job.get(key) or "").strip()
        for key in ("location_country", "location_city", "location_mode", "location")
    ):
        return True
    countries = _profile_countries(profile)
    job_country = _location_token(str(job.get("location_country") or ""))
    if countries and job_country and job_country not in countries:
        return False
    return any(_target_matches(target, countries, job) for target in targets)


def evaluate_credibility(
    profile: dict[str, Any],
    job: dict[str, Any],
    overall_score: float | None,
    recommendation: str | None,
) -> Credibility:
    if overall_score is not None and overall_score < 3.5:
        recommendation = "Skip"
    seniority = str(profile.get("target_seniority") or "any").strip().lower()
    # F5: the hash is a SCOPING key — "which direction was this verdict computed
    # for" — derived by `onboarding_service.context_key`, the ONE producer, so this
    # writer and the `get_result` reader cannot disagree about the same direction.
    # They used to: this side required a role title and normalised, that side did
    # neither, so a user with no recorded title got NULL rows against a non-NULL
    # lookup — `get_matches_for_context` matched nothing and `_shortlist` reported
    # "the market genuinely has no overlap" over a full stack. 162 of 196 users,
    # 1,289 real match rows.
    context_hash = context_key(profile)
    seniority_fit = seniority_compatibility(seniority, job)
    if seniority_fit == "unknown":
        # F3: the source seniority field is missing. Defer to the brain — a strong
        # Apply/Negotiate at >=3.5 already encodes an at-level judgment, so a blank
        # Firecrawl field must not structurally bar a genuinely strong match. A
        # weak/absent verdict leaves it "unknown" (honest — no forced compatibility).
        if (
            recommendation in {"Apply", "Negotiate"}
            and overall_score is not None
            and overall_score >= 3.5
        ):
            seniority_fit = "compatible"
    # Every gate here answers "is this a good, safe recommendation". The scoping
    # hash answered "which direction was this computed for" — a different question,
    # and the only one of the three absence-checks that had not been hardened (F3
    # defers an unreadable seniority to the brain, F4 reads absent location meta as
    # compatible). Requiring it made a bookkeeping field veto the recommendation:
    # 153 users had brain-rated matches and exactly ONE had an `is_recommended` row,
    # so `get_current_credible_match` returned None and the onboarding screen
    # offered "Review score gaps" instead of "Tailor for {role} at {company}" —
    # the 10-minute-CV core loop, withheld from 152 of 153 users by a null column.
    credible = bool(
        overall_score is not None
        and overall_score >= 3.5
        and recommendation in {"Apply", "Negotiate"}
        and seniority_fit == "compatible"
        and location_compatible(profile, job)
    )
    return Credibility(recommendation, seniority_fit, context_hash, credible)
